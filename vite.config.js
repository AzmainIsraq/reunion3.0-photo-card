import { defineConfig } from 'vite'

export default defineConfig({
  // relative asset paths so dist/ works on Cloudflare Pages, subpaths and file hosting
  base: './',
  optimizeDeps: {
    // the wasm/onnx loader inside @imgly/background-removal must not be pre-bundled
    exclude: ['@imgly/background-removal'],
  },
  build: {
    chunkSizeWarningLimit: 6000,
  },
})
