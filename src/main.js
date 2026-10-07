import JSZip from 'jszip';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/montserrat/700-italic.css';
import '@fontsource/montserrat/800-italic.css';
import '@fontsource/baloo-da-2/700.css';
import './styles.css';

import {
  CARD, LAYOUT, DEFAULT_CAPTION, prepareAssets, buildBrandLayer, renderCard,
  clampTransform, autoTransform, rr,
} from './card.js';
import { removeBackground } from './bg.js';
import toybroLogoUrl from './assets/toybro-logo.png';

const $ = (sel) => document.querySelector(sel);

// ---- state ------------------------------------------------------------------
let assets = null;
let brandLayer = null;
let photos = [];            // {id,name,src,cutout,useCutout,busy,progress,transform,thumb}
let selectedId = null;
let fmt = 'jpeg';
let uid = 0;

const preview = $('#preview');
const pctx = preview.getContext('2d');
const captionInput = $('#captionInput');

// ---- tiny helpers -----------------------------------------------------------
function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function selected() {
  return photos.find((p) => p.id === selectedId) || null;
}

function fmtName(p) {
  return (p.name.replace(/\.[^.]+$/, '') || 'photo').replace(/[^\w-]+/g, '-').slice(0, 40);
}

async function loadFileToCanvas(file, maxDim = 1600) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('decode');
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return cv;
}

// ---- rendering --------------------------------------------------------------
let rafPending = false;
function requestRender() {
  if (rafPending) return;
  rafPending = true;
  let done = false;
  const draw = () => {
    if (done) return;
    done = true;
    rafPending = false;
    const p = selected();
    renderCard(pctx, brandLayer, assets, p?.src || null, p?.cutout || null,
      p?.transform || { zoom: 1, x: 0, y: 0, flip: false },
      p ? p.useCutout : false,
      p ? p.caption : DEFAULT_CAPTION);
  };
  // some embedded webviews throttle rAF even when visible — always schedule
  // a timeout fallback so the preview never stalls
  requestAnimationFrame(draw);
  setTimeout(draw, 60);
}

function renderThumb(p) {
  const t = p.thumb;
  const ctx = t.getContext('2d');
  const s = Math.max(84 / p.src.width, 84 / p.src.height) * 1;
  const w = p.src.width * s, h = p.src.height * s;
  ctx.clearRect(0, 0, 84, 84);
  ctx.drawImage(p.src, (84 - w) / 2, (84 - h) / 2, w, h);
}

// ---- filmstrip --------------------------------------------------------------
function renderStrip() {
  const strip = $('#strip');
  strip.innerHTML = '';
  $('#count').textContent = photos.length;
  for (const p of photos) {
    const cell = document.createElement('div');
    cell.className = 'thumb' + (p.id === selectedId ? ' active' : '');
    cell.setAttribute('role', 'option');
    cell.setAttribute('aria-selected', p.id === selectedId ? 'true' : 'false');
    cell.tabIndex = 0;
    cell.title = p.name;
    const cv = document.createElement('canvas');
    cv.width = 84; cv.height = 84;
    p.thumb = cv;
    cell.appendChild(cv);
    renderThumb(p);

    if (p.busy) {
      const sp = document.createElement('span');
      sp.className = 'spinner';
      cell.appendChild(sp);
    } else {
      if (p.cutout) {
        const b = document.createElement('span');
        b.className = 'badge-cut';
        b.textContent = '✂';
        b.title = p.useCutout ? 'Cutout in use' : 'Cutout ready (off)';
        cell.appendChild(b);
      }
      const x = document.createElement('button');
      x.className = 'thumb-x';
      x.type = 'button';
      x.textContent = '×';
      x.title = 'Remove photo';
      x.setAttribute('aria-label', `Remove ${p.name}`);
      x.onclick = (e) => { e.stopPropagation(); removePhoto(p.id); };
      cell.appendChild(x);
    }
    cell.onclick = () => selectPhoto(p.id);
    cell.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPhoto(p.id); }
    };
    strip.appendChild(cell);
  }
}

function removePhoto(id) {
  const p = photos.find((x) => x.id === id);
  if (!p) return;
  if (p.busy) { toast('Wait for background removal to finish first.'); return; }
  if (!window.confirm(`Remove "${p.name}" from the list?`)) return;
  photos = photos.filter((x) => x.id !== id);
  if (selectedId === id) selectedId = photos.length ? photos[0].id : null;
  if (!photos.length) {
    $('#empty').classList.remove('hidden');
    $('#editor').classList.add('hidden');
    $('#mobilebar').classList.add('hidden');
    document.body.classList.remove('has-editor');
  }
  renderStrip();
  syncEditorControls();
  requestRender();
}

function selectPhoto(id) {
  selectedId = id;
  syncEditorControls();
  renderStrip();
  requestRender();
}

// ---- editor controls sync ----------------------------------------------------
function syncEditorControls() {
  const p = selected();
  const bgBtn = $('#bgBtn');
  const status = $('#bgStatus');
  const cutWrap = $('#useCutoutWrap');
  const cutCheck = $('#useCutout');
  const zoom = $('#zoom');

  if (!p) {
    bgBtn.disabled = true;
    status.textContent = '';
    cutWrap.hidden = true;
    zoom.value = 100;
    return;
  }
  bgBtn.disabled = p.busy;
  if (p.busy) {
    const pct = Math.round(p.progress * 100);
    status.textContent = p.progress > 0 ? `Working… ${pct}%` : 'Preparing AI model…';
  } else if (p.cutout) {
    status.textContent = 'Background removed ✓';
  } else {
    status.textContent = '';
  }

  cutWrap.hidden = !p.cutout;
  cutCheck.checked = !!p.useCutout;
  zoom.value = Math.round(p.transform.zoom * 100);
  if (document.activeElement !== captionInput) captionInput.value = p.caption || '';
}

// ---- upload ------------------------------------------------------------------
async function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  let firstId = null;
  for (const f of files) {
    try {
      const src = await loadFileToCanvas(f);
      const p = {
        id: ++uid, name: f.name || `photo-${uid}.jpg`,
        src, cutout: null, useCutout: false, busy: false, progress: 0,
        transform: autoTransform(src), thumb: null,
        caption: DEFAULT_CAPTION,
      };
      photos.push(p);
      firstId ??= p.id;
    } catch {
      toast(`Couldn't read ${f.name} — unsupported format?`);
    }
  }
  $('#empty').classList.add('hidden');
  $('#editor').classList.remove('hidden');
  $('#mobilebar').classList.remove('hidden');
  document.body.classList.add('has-editor');
  if (firstId) selectedId = firstId;
  renderStrip();
  syncEditorControls();
  requestRender();
  if (photos.length > 1) toast(`${photos.length} photos added — try “Remove backgrounds for all”.`);
}

// ---- background removal -------------------------------------------------------
async function removeBgFor(p) {
  if (p.busy || p.cutout) return;
  p.busy = true; p.progress = 0;
  renderStrip(); syncEditorControls();
  try {
    const cut = await removeBackground(p.src, ({ phase, p: pct }) => {
      p.progress = phase === 'model' ? 0 : Math.max(p.progress, pct * 0.98 + 0.01);
      syncEditorControls();
    });
    p.cutout = cut;
    p.useCutout = true;
  } catch (err) {
    console.error(err);
    toast('Background removal failed — check your connection (first use downloads the AI model) and try again.');
  } finally {
    p.busy = false; p.progress = 0;
    renderStrip(); syncEditorControls(); requestRender();
  }
}

let bulkRunning = false;
async function removeBgForAll() {
  if (bulkRunning) return;
  const queue = photos.filter((p) => !p.cutout && !p.busy);
  if (!queue.length) { toast('Every photo already has its background removed ✓'); return; }
  bulkRunning = true;
  setBulkButtons(true);
  let done = 0;
  for (const p of queue) {
    updateBulk(`Removing background… ${done + 1}/${queue.length}`);
    await removeBgFor(p);
    done++;
  }
  updateBulk(`Done — ${done} photo${done > 1 ? 's' : ''} processed ✓`);
  bulkRunning = false;
  setBulkButtons(false);
  setTimeout(() => { $('#bulkStatus').textContent = ''; }, 4000);
}

function setBulkButtons(disabled) {
  for (const id of ['bgAllBtn', 'zipBtn', 'fitAllBtn', 'bgBtn']) $(`#${id}`).disabled = disabled;
}

function updateBulk(text) {
  $('#bulkStatus').textContent = text;
}

// ---- download ------------------------------------------------------------------
function renderToCanvas() {
  const cv = document.createElement('canvas');
  cv.width = CARD; cv.height = CARD;
  const p = selected();
  if (!p) return cv;
  renderCard(cv.getContext('2d'), brandLayer, assets, p.src, p.cutout, p.transform, p.useCutout, p.caption);
  return cv;
}

function canvasToBlob(cv, type, quality = 0.93) {
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), type, quality));
}

function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

async function downloadSingle() {
  const p = selected();
  if (!p) return;
  const btn = $('#dlBtn');
  btn.disabled = true; btn.textContent = 'Rendering…';
  try {
    const cv = renderToCanvas();
    const type = fmt === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await canvasToBlob(cv, type);
    saveBlob(blob, `reunion3-card-${fmtName(p)}.${fmt === 'png' ? 'png' : 'jpg'}`);
  } finally {
    btn.disabled = false; btn.textContent = '⬇ Download this card';
  }
}

async function downloadZip() {
  if (!photos.length) return;
  if (bulkRunning) return;
  bulkRunning = true;
  setBulkButtons(true);
  const btn = $('#zipBtn');
  const old = btn.textContent;
  try {
    const zip = new JSZip();
    const type = fmt === 'png' ? 'image/png' : 'image/jpeg';
    const ext = fmt === 'png' ? 'png' : 'jpg';
    const used = new Set();
    const cv = document.createElement('canvas');
    cv.width = CARD; cv.height = CARD;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      updateBulk(`Rendering card ${i + 1}/${photos.length}…`);
      btn.textContent = `Rendering ${i + 1}/${photos.length}…`;
      renderCard(ctx, brandLayer, assets, p.src, p.cutout, p.transform, p.useCutout, p.caption);
      const blob = await canvasToBlob(cv, type);
      let name = `reunion3-card-${String(i + 1).padStart(2, '0')}-${fmtName(p)}.${ext}`;
      while (used.has(name)) name = name.replace(/(\.\w+)$/, '-x$1');
      used.add(name);
      zip.file(name, blob);
    }
    updateBulk('Packing ZIP…');
    btn.textContent = 'Packing ZIP…';
    const out = await zip.generateAsync({ type: 'blob' }, (meta) => {
      if (meta.percent && meta.currentFile) updateBulk(`Packing… ${Math.round(meta.percent)}%`);
    });
    saveBlob(out, `reunion3-photocards-${photos.length}.zip`);
    updateBulk(`ZIP saved — ${photos.length} cards ✓`);
  } catch (err) {
    console.error(err);
    toast('Could not build the ZIP — try again.');
  } finally {
    bulkRunning = false;
    setBulkButtons(false);
    btn.textContent = old;
    setTimeout(() => { $('#bulkStatus').textContent = ''; }, 4000);
  }
}

// ---- pointer interaction (pan / pinch) -----------------------------------------
const pointers = new Map();
let pinchStart = null;

function toCardCoords(clientX, clientY) {
  const r = preview.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / r.width) * CARD,
    y: ((clientY - r.top) / r.height) * CARD,
  };
}

function applyZoomAround(factor, cardPt) {
  const p = selected();
  if (!p) return;
  const f = LAYOUT.frame;
  const fcx = f.x + f.w / 2, fcy = f.y + f.h / 2;
  const t = p.transform;
  const newZoom = Math.min(3.2, Math.max(1, t.zoom * factor));
  const real = newZoom / t.zoom;
  // keep the card point under the cursor stable
  t.x = (t.x + fcx - cardPt.x) * real + (cardPt.x - fcx);
  t.y = (t.y + fcy - cardPt.y) * real + (cardPt.y - fcy);
  t.zoom = newZoom;
  p.transform = clampTransform(p.src, t);
  syncZoomSlider();
  requestRender();
}

function syncZoomSlider() {
  const p = selected();
  if (p) $('#zoom').value = Math.round(p.transform.zoom * 100);
}

preview.addEventListener('pointerdown', (e) => {
  const p = selected();
  if (!p) return;
  preview.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      zoom: p.transform.zoom,
      mid: toCardCoords((a.x + b.x) / 2, (a.y + b.y) / 2),
    };
  }
});

preview.addEventListener('pointermove', (e) => {
  const p = selected();
  if (!p || !pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1) {
    const r = preview.getBoundingClientRect();
    const t = p.transform;
    t.x += ((e.clientX - prev.x) / r.width) * CARD;
    t.y += ((e.clientY - prev.y) / r.height) * CARD;
    p.transform = clampTransform(p.src, t);
    requestRender();
  } else if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (dist > 0) applyZoomAround(dist / pinchStart.dist, pinchStart.mid);
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
}
preview.addEventListener('pointerup', endPointer);
preview.addEventListener('pointercancel', endPointer);

preview.addEventListener('wheel', (e) => {
  const p = selected();
  if (!p) return;
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0016);
  applyZoomAround(factor, toCardCoords(e.clientX, e.clientY));
}, { passive: false });

preview.addEventListener('dblclick', () => {
  const p = selected();
  if (!p) return;
  p.transform = { ...autoTransform(p.src), flip: p.transform.flip };
  syncZoomSlider();
  requestRender();
});

// ---- wire up controls -----------------------------------------------------------
$('#zoom').addEventListener('input', (e) => {
  const p = selected();
  if (!p) return;
  const target = Math.max(1, Math.min(3.2, e.target.value / 100));
  applyZoomAround(target / p.transform.zoom, { x: LAYOUT.frame.x + LAYOUT.frame.w / 2, y: LAYOUT.frame.y + LAYOUT.frame.h / 2 });
});

$('#flipBtn').onclick = () => {
  const p = selected();
  if (!p) return;
  p.transform.flip = !p.transform.flip;
  requestRender();
};

$('#fitBtn').onclick = () => {
  const p = selected();
  if (!p) return;
  p.transform = { ...autoTransform(p.src), flip: p.transform.flip };
  syncZoomSlider();
  requestRender();
};

$('#resetBtn').onclick = () => {
  const p = selected();
  if (!p) return;
  p.transform = autoTransform(p.src);
  syncZoomSlider();
  requestRender();
};

$('#bgBtn').onclick = () => {
  const p = selected();
  if (p) removeBgFor(p);
};

$('#useCutout').onchange = (e) => {
  const p = selected();
  if (!p) return;
  p.useCutout = e.target.checked;
  renderStrip();
  requestRender();
};

$('#bgAllBtn').onclick = removeBgForAll;

// speech-cloud caption (per photo; empty text hides the cloud)
captionInput.addEventListener('input', () => {
  const p = selected();
  if (!p) return;
  p.caption = captionInput.value;
  requestRender();
});
$('#fitAllBtn').onclick = () => {
  for (const p of photos) p.transform = autoTransform(p.src);
  syncZoomSlider();
  requestRender();
  toast(`Auto-fit applied to ${photos.length} photos`);
};

$('#dlBtn').onclick = downloadSingle;
$('#zipBtn').onclick = downloadZip;

for (const id of ['addBtn', 'addMore', 'mAdd']) $(`#${id}`).onclick = () => $('#file').click();
$('#mDl').onclick = downloadSingle;
$('#file').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };

// format segmented control
$('#fmt').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-fmt]');
  if (!btn) return;
  fmt = btn.dataset.fmt;
  for (const b of $('#fmt').querySelectorAll('button')) {
    const on = b === btn;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  }
});

// drag & drop + paste everywhere
const overlay = $('#dropOverlay');
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  overlay.classList.remove('hidden');
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) overlay.classList.add('hidden');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.classList.add('hidden');
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
});
window.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean);
  if (files.length) addFiles(files);
});

// ---- boot ---------------------------------------------------------------------
async function boot() {
  try {
    await Promise.all([
      document.fonts.load('italic 800 32px Montserrat'),
      document.fonts.load('italic 700 22px Montserrat'),
      document.fonts.load('800 32px Montserrat'),
      document.fonts.load('700 28px Montserrat'),
      // Bengali glyphs for the speech cloud
      document.fonts.load('700 31px "Baloo Da 2"', DEFAULT_CAPTION),
    ]);
  } catch { /* fonts fall back silently */ }

  assets = await prepareAssets();
  brandLayer = buildBrandLayer(assets);

  // mini teaser card on the empty state
  const mini = $('#miniCard');
  const mctx = mini.getContext('2d');
  const demoDemo = document.createElement('canvas');
  demoDemo.width = CARD; demoDemo.height = CARD;
  renderCard(demoDemo.getContext('2d'), brandLayer, assets, null, null, null, false, DEFAULT_CAPTION);
  mctx.drawImage(demoDemo, 0, 0, 360, 360);

  // sidebar ad + navbar — ToyBro BD logo (bundled asset URL)
  $('#promoLogo').src = toybroLogoUrl;
  $('#brandLogo').src = toybroLogoUrl;

  requestRender();
}

boot();
