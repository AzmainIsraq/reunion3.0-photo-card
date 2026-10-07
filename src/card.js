/**
 * Card renderer — builds the 1080×1080 "Entrepreneurs' Reunion 3.0" photo card.
 * Static layers (background, logos, date, partner strip) are painted once into
 * an offscreen canvas; per-photo layers (framed photo + cutout pop-out + title
 * logo) are composed on top for every render.
 */

export const CARD = 1080;

// ---- layout constants (card space) ----------------------------------------
export const LAYOUT = {
  frame: { x: 280, y: 148, w: 520, h: 520, r: 44, border: 13 },
  titleLogoHeight: 252,   // reunion logo (trimmed) height on card
  titleLogoTop: 678,
  dateLine1: 'FRIDAY, 16TH OCTOBER, 2026',
  dateLine2: 'AT DAFFODIL INTERNATIONAL UNIVERSITY',
  stripY: 1014,
  stripH: 66,
  cloud: { x: 54, y: 122, maxW: 400 },
};

export const DEFAULT_CAPTION = 'আমি আসছি, আপনি আসছেন তো?';
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

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

/** Downscale to maxDim, run optional processing, then crop transparent borders. */
export async function prepareLogo(src, maxDim = 1400, post = null) {
  const img = await loadImage(src);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(img, 0, 0, w, h);
  if (post) post(cv);

  const sctx = cv.getContext('2d');
  const data = sctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return cv;
  const pad = 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  out.getContext('2d').drawImage(cv, minX, minY, tw, th, 0, 0, tw, th);
  return out;
}

/**
 * The DEC logo ships on an opaque white background with black text.
 * Convert the white matte to transparency (alpha = 255 - min(r,g,b)) and turn
 * grayscale pixels into white so the logo reads on the green card. The yellow
 * bulb stays colored.
 */
export function decOnGreen(cv) {
  const ctx = cv.getContext('2d');
  const id = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    if (mx - mn < 40) {
      // grayscale (text / white bg / antialiased edges) → white with matte alpha
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = 255 - mn;
    } else {
      d[i + 3] = 255; // colored artwork fully opaque
    }
  }
  ctx.putImageData(id, 0, 0);
  return cv;
}

// ---- background (procedural grunge, deterministic) --------------------------
export function paintBackground(ctx, size = CARD) {
  const rnd = mulberry32(20261016);
  const s = size / CARD;
  ctx.save();
  ctx.scale(s, s);

  const base = ctx.createLinearGradient(0, 0, CARD, CARD);
  base.addColorStop(0, '#1BA552');
  base.addColorStop(0.45, '#12914A');
  base.addColorStop(1, '#0B7439');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, CARD, CARD);

  // soft light behind the frame
  const glow = ctx.createRadialGradient(540, 400, 60, 540, 400, 760);
  glow.addColorStop(0, 'rgba(255,255,255,0.14)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD, CARD);

  // dark brush blobs
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 30; i++) {
    const x = rnd() * CARD, y = rnd() * CARD;
    const w = 170 + rnd() * 460, h = 36 + rnd() * 96;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rnd() - 0.5) * 2.4);
    ctx.globalAlpha = 0.04 + rnd() * 0.07;
    ctx.fillStyle = '#03421f';
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // light streaks
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 16; i++) {
    const x = rnd() * CARD, y = rnd() * CARD;
    const w = 300 + rnd() * 640, h = 12 + rnd() * 34;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.5 + rnd() * 0.5);
    ctx.globalAlpha = 0.03 + rnd() * 0.05;
    ctx.fillStyle = '#b8f7cd';
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // diagonal lines
  for (let i = 0; i < 10; i++) {
    const x = rnd() * CARD, y = rnd() * CARD, len = 300 + rnd() * 700;
    const ang = -0.55 - rnd() * 0.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = rnd() > 0.35 ? 'rgba(255,255,255,0.07)' : 'rgba(0,45,20,0.14)';
    ctx.lineWidth = 2 + rnd() * 4;
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.lineTo(len / 2, 0);
    ctx.stroke();
    ctx.restore();
  }

  // subtle checker patches in two corners
  const checker = (cx, cy, rot, cols, rows) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if ((r + c) % 2 === 0) ctx.fillRect(c * 26, r * 26, 26, 26);
    ctx.restore();
  };
  checker(690, -60, Math.PI / 4, 14, 8);
  checker(-140, 700, Math.PI / 4, 12, 10);

  // vignette
  const vig = ctx.createRadialGradient(540, 540, 380, 540, 540, 800);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,38,17,0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, CARD, CARD);

  ctx.restore();
}

// ---- assets + static brand layer --------------------------------------------
export async function prepareAssets() {
  const [deptRaw, diu, dec, reunion, heart, softbite, goods, brave] = await Promise.all([
    prepareLogo(new URL('./assets/dept-logo.png', import.meta.url).href, 400),
    prepareLogo(new URL('./assets/diu-logo.png', import.meta.url).href, 400),
    // the white matte must be removed BEFORE the alpha trim
    prepareLogo(new URL('./assets/dec-logo.png', import.meta.url).href, 1200, decOnGreen),
    prepareLogo(new URL('./assets/reunion-logo.png', import.meta.url).href, 1400),
    prepareLogo(new URL('./assets/partner-banglalink-heart.png', import.meta.url).href, 320),
    prepareLogo(new URL('./assets/partner-softbite.png', import.meta.url).href, 500),
    prepareLogo(new URL('./assets/partner-goodspacker.png', import.meta.url).href, 1200),
    // the logo sits in a small band of a huge square canvas — keep resolution
    prepareLogo(new URL('./assets/partner-braveheart.png', import.meta.url).href, 2500),
  ]);
  return { dept: deptRaw, diu, dec, reunion, heart, softbite, goods, brave };
}

function drawFit(ctx, cv, x, y, h, align = 'center') {
  const w = h * (cv.width / cv.height);
  const dx = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  ctx.drawImage(cv, dx, y, w, h);
  return w;
}

/** Static layer: background + top logos + date lines + partner strip. */
export function buildBrandLayer(assets) {
  const cv = document.createElement('canvas');
  cv.width = CARD; cv.height = CARD;
  const ctx = cv.getContext('2d');
  paintBackground(ctx);

  // top logos row
  ctx.save();
  ctx.shadowColor = 'rgba(0,30,12,0.35)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  drawFit(ctx, assets.dept, 46, 40, 64, 'left');
  drawFit(ctx, assets.diu, CARD / 2, 28, 90, 'center');
  drawFit(ctx, assets.dec, CARD - 46, 44, 74, 'right');
  ctx.restore();

  // date lines
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,30,12,0.45)';
  ctx.shadowBlur = 10;
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'italic 800 31px Montserrat, sans-serif';
  ctx.fillText(LAYOUT.dateLine1, CARD / 2, 972);
  ctx.font = 'italic 700 20.5px Montserrat, sans-serif';
  ctx.globalAlpha = 0.94;
  ctx.fillText(LAYOUT.dateLine2, CARD / 2, 1003);
  ctx.restore();

  // white partner strip
  const y0 = LAYOUT.stripY, h = LAYOUT.stripH;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, y0, CARD, h);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, y0, CARD, 2);

  const label = 'PARTNERS:';
  ctx.font = 'italic 800 20px Montserrat, sans-serif';
  const labelW = ctx.measureText(label).width;

  // banglalink ships as heart + wordmark in one asset
  const blH = 32;
  const blW = blH * (assets.heart.width / assets.heart.height);
  const softH = 50;
  const softW = softH * (assets.softbite.width / assets.softbite.height);
  const goodsH = 24;
  const goodsW = goodsH * (assets.goods.width / assets.goods.height);
  const braveH = 26;
  const braveW = braveH * (assets.brave.width / assets.brave.height);

  const gap = 26;
  const total = labelW + 26 + blW + gap + softW + gap + goodsW + gap + braveW;
  let x = (CARD - total) / 2;
  const cy = y0 + h / 2;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111111';
  ctx.fillText(label, x, cy + 1);
  x += labelW + 26;

  ctx.drawImage(assets.heart, x, cy - blH / 2, blW, blH);
  x += blW + gap;

  ctx.drawImage(assets.softbite, x, cy - softH / 2, softW, softH);
  x += softW + gap;
  ctx.drawImage(assets.goods, x, cy - goodsH / 2, goodsW, goodsH);
  x += goodsW + gap;
  ctx.drawImage(assets.brave, x, cy - braveH / 2, braveW, braveH);
  ctx.restore();

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

/** Rounded speech bubble (square style) with the caption text; adapts to length. */
export function drawCloud(ctx, text) {
  const t = (text || '').trim();
  if (!t) return;
  const { x, y, maxW } = LAYOUT.cloud;
  const padX = 32, padY = 20, tail = 26;

  // fit: start at 31px, shrink until it fits in ≤3 lines of maxW
  let size = 31, lines = null, textW = 0;
  for (; size >= 19; size -= 2) {
    ctx.font = `700 ${size}px ${CAPTION_FONT}`;
    lines = wrapCaption(ctx, t, maxW - padX * 2);
    textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length <= 3 && textW <= maxW - padX * 2) break;
  }
  const lineH = size * 1.42;
  const bodyW = Math.min(maxW, textW + padX * 2);
  const bodyH = lines.length * lineH + padY * 2;
  const r = Math.min(30, bodyH * 0.3);

  // sprite: rounded bubble + tail, so the drop shadow stays clean
  const sprW = Math.ceil(bodyW + tail * 0.7 + 6);
  const sprH = Math.ceil(bodyH + tail + 6);
  const spr = document.createElement('canvas');
  spr.width = sprW; spr.height = sprH;
  const s = spr.getContext('2d');
  s.fillStyle = '#FFFFFF';
  rr(s, 0, 0, bodyW, bodyH, r);
  s.fill();

  // tail: sweeps out of the bottom-right corner, pointing at the photo
  const by = bodyH - 3;
  s.beginPath();
  s.moveTo(bodyW * 0.78, by);
  s.quadraticCurveTo(bodyW * 0.94, by + tail * 0.42, bodyW + 16, by + tail);
  s.quadraticCurveTo(bodyW * 0.94, by + tail * 0.5, bodyW - 8, by);
  s.closePath();
  s.fill();

  // sprite onto the card with a soft shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,25,10,0.38)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  ctx.drawImage(spr, x, y);
  ctx.restore();

  // caption text (dark green, centred in the bubble)
  ctx.save();
  ctx.fillStyle = '#0b3d23';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px ${CAPTION_FONT}`;
  const textCY = y + bodyH / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, x + bodyW / 2, textCY + (i - (lines.length - 1) / 2) * lineH);
  });
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
export function renderCard(ctx, brandLayer, assets, photo, cutout, t, useCutout = true, caption = null) {
  ctx.clearRect(0, 0, CARD, CARD);
  ctx.drawImage(brandLayer, 0, 0);

  const f = LAYOUT.frame;

  if (photo) {
    // frame drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,25,10,0.45)';
    ctx.shadowBlur = 44;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = '#0a5a2b';
    rr(ctx, f.x - f.border, f.y - f.border, f.w + f.border * 2, f.h + f.border * 2, f.r + f.border);
    ctx.fill();
    ctx.restore();

    // photo clipped to frame
    ctx.save();
    rr(ctx, f.x, f.y, f.w, f.h, f.r);
    ctx.clip();
    drawPhotoAt(ctx, photo, t);
    ctx.restore();

    // white border
    ctx.save();
    ctx.lineWidth = f.border;
    ctx.strokeStyle = '#FFFFFF';
    rr(ctx, f.x, f.y, f.w, f.h, f.r);
    ctx.stroke();
    ctx.restore();

    // cutout pop-out: free above the frame, clipped at the frame's bottom
    // edge so the figure ends on the border instead of floating mid-card
    if (cutout && useCutout) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, CARD, f.y + f.h + f.border);
      ctx.clip();
      ctx.shadowColor = 'rgba(0,25,10,0.5)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      drawPhotoAt(ctx, cutout, t);
      ctx.restore();
    }
  }

  // title logo always on top
  const H = LAYOUT.titleLogoHeight;
  const W = H * (assets.reunion.width / assets.reunion.height);
  ctx.save();
  ctx.shadowColor = 'rgba(0,30,12,0.3)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.drawImage(assets.reunion, (CARD - W) / 2, LAYOUT.titleLogoTop, W, H);
  ctx.restore();

  // speech cloud sticker (topmost)
  drawCloud(ctx, caption);
}
