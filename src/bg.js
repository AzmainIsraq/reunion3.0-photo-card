/**
 * Background removal via @imgly/background-removal (on-device WASM).
 * The model (~11 MB, quint8) is downloaded on first use and cached by the
 * browser afterwards.
 */

let libPromise = null;

function loadLib() {
  libPromise ??= import('@imgly/background-removal');
  return libPromise;
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas encode failed'))), 'image/png'),
  );
}

/**
 * @param {HTMLCanvasElement} sourceCanvas photo (already downscaled)
 * @param {(info: {phase: 'model'|'work', p: number}) => void} onProgress
 * @returns {Promise<HTMLCanvasElement>} transparent cutout, same dimensions
 */
export async function removeBackground(sourceCanvas, onProgress) {
  const { removeBackground } = await loadLib();
  // the lib only decodes string/URL/Blob inputs — hand it a PNG blob
  const blob = await removeBackground(await canvasToPngBlob(sourceCanvas), {
    model: 'isnet_quint8',
    output: { format: 'image/png', quality: 1 },
    progress: (key, current, total) => {
      const p = total > 0 ? current / total : 0;
      onProgress?.(key.startsWith('fetch') ? { phase: 'model', p } : { phase: 'work', p });
    },
  });
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  cv.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close?.();
  return cv;
}
