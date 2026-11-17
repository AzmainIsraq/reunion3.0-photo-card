/** Card renderer — 1080×1080 event template with the photo in a circle + editable caption. */

export const CARD = 1080;

// Layout in card space (template.png is 1600px, scaled by 0.675). The photo
// circle sits inside the template's blue ring; `frame` is its bounding square.
export const LAYOUT = {
  frame: { x: 587, y: 265, w: 458, h: 458, r: 229, border: 0 },
  caption: { x: 590, y: 780, w: 455, h: 135, cx: 809, cy: 848 },
};

export const DEFAULT_CAPTION = 'আমরা আসছি, আপনি আসছেন তো?';
export const CAPTION_FONT = '"Baloo Da 2", "Noto Sans Bengali", "Nirmala UI", sans-serif';

// ---- tiny utils -------------------------------------------------------------
export function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}

// ---- assets + static brand layer --------------------------------------------
export async function prepareAssets() {
  return { template: await loadImage(new URL('./assets/template.png', import.meta.url).href) };
}

/** Static layer: the event template (circle area is covered by the photo). */
export function buildBrandLayer(assets) {
  const cv = document.createElement('canvas');
  cv.width = CARD; cv.height = CARD;
  cv.getContext('2d').drawImage(assets.template, 0, 0, CARD, CARD);
  return cv;
}

// ---- speech cloud (top-left sticker) -----------------------------------------
function wrapCaption(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width <= maxW || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Caption under the circle: blanks the template's baked-in text, then draws ours. */
export function drawCloud(ctx, text) {
  const { x, y, w, h, cx, cy } = LAYOUT.caption;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x, y, w, h);
  const t = (text || '').trim();
  if (!t) return;
  let size = 52, lines;
  for (; size >= 22; size -= 2) {
    ctx.font = `800 ${size}px ${CAPTION_FONT}`;
    lines = wrapCaption(ctx, t, w - 20);
    if (lines.length * size * 1.3 <= h && Math.max(...lines.map((l) => ctx.measureText(l).width)) <= w - 20) break;
  }
  const lineH = size * 1.3;
  ctx.save();
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * lineH));
  ctx.restore();
}

// ---- per-photo composition --------------------------------------------------
export function coverScale(photo, frame) {
  return Math.max(frame.w / photo.width, frame.h / photo.height);
}

export function clampTransform(photo, t) {
  const f = LAYOUT.frame;
  const s = coverScale(photo, f) * t.zoom;
  const maxX = Math.max(0, (photo.width * s - f.w) / 2);
  const maxY = Math.max(0, (photo.height * s - f.h) / 2);
  return {
    zoom: t.zoom,
    flip: !!t.flip,
    x: Math.max(-maxX, Math.min(maxX, t.x)),
    y: Math.max(-maxY, Math.min(maxY, t.y)),
  };
}

/** Sensible default framing: cover, biased slightly toward the top (faces). */
export function autoTransform(photo) {
  const f = LAYOUT.frame;
  const s = coverScale(photo, f);
  const excessY = (photo.height * s - f.h) / 2;
  return { zoom: 1, x: 0, y: excessY > 0 ? -excessY * 0.28 : 0, flip: false };
}

function drawPhotoAt(ctx, photo, t) {
  const f = LAYOUT.frame;
  const s = coverScale(photo, f) * t.zoom;
  const w = photo.width * s, h = photo.height * s;
  const cx = f.x + f.w / 2 + t.x, cy = f.y + f.h / 2 + t.y;
  ctx.save();
  if (t.flip) {
    ctx.translate(cx, cy);
    ctx.scale(-1, 1);
    ctx.drawImage(photo, -w / 2, -h / 2, w, h);
  } else {
    ctx.drawImage(photo, cx - w / 2, cy - h / 2, w, h);
  }
  ctx.restore();
}

/**
 * Full card render.
 * @param ctx   target 2d context (1080×1080 canvas)
 * @param photo photo canvas (may be null → branding-only preview)
 * @param cutout background-removed canvas or null
 * @param t     {zoom,x,y,flip}
 * @param useCutout draw the pop-out when available
 * @param caption speech-cloud text (null/'' hides the cloud)
 */
export function renderCard(ctx, brandLayer, _assets, photo, cutout, t, useCutout = true, caption = null) {
  ctx.clearRect(0, 0, CARD, CARD);
  ctx.drawImage(brandLayer, 0, 0);

  const f = LAYOUT.frame;

  if (photo) {
    const ccx = f.x + f.w / 2, ccy = f.y + f.h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ccx, ccy, f.r, 0, Math.PI * 2);
    ctx.clip();
    drawPhotoAt(ctx, photo, t);
    ctx.restore();

    // cutout pop-out: free above the circle, clipped at its bottom edge
    if (cutout && useCutout) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, CARD, ccy + f.r);
      ctx.clip();
      ctx.shadowColor = 'rgba(0,25,10,0.4)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      drawPhotoAt(ctx, cutout, t);
      ctx.restore();
    }
  }

  // speech cloud sticker (topmost)
  drawCloud(ctx, caption);
}
