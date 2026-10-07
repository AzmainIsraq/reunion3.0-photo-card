# Reunion 3.0 · Photo Card Studio

A browser-based photo card maker for the **Entrepreneurs' Reunion 3.0** event
(Daffodil Entrepreneurs' Club & Department of Innovation & Entrepreneurship,
Daffodil International University).

Attendees add their photo, the app cuts out the background with on-device AI,
places it on the official **1080 × 1080** event card, and exports a
social-media-ready image.

## Features

- **Remove background** — AI cutout runs entirely in the browser
  (`@imgly/background-removal`, ISNet quint8 ≈ 11 MB model, downloaded once and
  cached). Photos never leave the device.
- **Single edit** — drag to reposition, scroll/pinch to zoom, flip, auto-fit and
  reset. When the background is removed the person "pops out" of the frame.
- **Bulk edit** — remove backgrounds for every uploaded photo in one queue and
  auto-fit all of them at once.
- **Download** — single cards (JPG or PNG) or every card packed into a ZIP.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

## Build & deploy

```bash
npm run build      # outputs dist/
npm run preview    # serve dist/ locally
```

The build uses **relative asset paths** (`base: './'`), so `dist/` works on any
static host and under any subpath.

### Deploying to Cloudflare Pages

**Option A — Direct Upload (fastest):**

1. Run `npm run build`.
2. Go to Cloudflare Dashboard → Workers & Pages → Create → Pages → **Upload assets**.
3. Drag the **`dist` folder** (the folder itself, so `index.html` sits at the root
   of the project) and deploy.

> ⚠️ Don't upload the project root — `index.html` there is the Vite source file
> and has no built CSS/JS next to it. Always deploy `dist/`.

**Option B — Wrangler CLI:**

```bash
npm run build
npx wrangler pages deploy dist
```

`wrangler.toml` in this repo is already configured with
`pages_build_output_dir = "dist"`.

**Option C — Git integration:** set Build command `npm run build` and Build
output directory `dist`.

> **Note:** the first background removal downloads the AI model (~11 MB) from a
> CDN; afterwards it's served from the browser cache. Everything else
> (rendering, ZIP packing) is fully client-side.

## Project layout

```
index.html          UI shell
src/main.js         app state, uploads, editor interactions, downloads
src/card.js         1080×1080 card renderer (background, logos, frame, branding)
src/bg.js           background-removal wrapper
src/assets/         event logos (trimmed/recolored at runtime)
src/styles.css      responsive styles (mobile + desktop)
```
