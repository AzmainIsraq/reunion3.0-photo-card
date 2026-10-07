import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    // the wasm/onnx loader inside @imgly/background-removal must not be pre-bundled
    exclude: ['@imgly/background-removal'],
  },
  build: {
    chunkSizeWarningLimit: 6000,
  },
})
