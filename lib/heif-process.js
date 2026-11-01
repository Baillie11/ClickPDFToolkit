// Isolated, CPU-portable HEIF/AVIF worker for the ImageMagick backend.
// The parent caps input/output, terminates timed-out jobs and discards decoder logs.
const { PNG } = require('pngjs');
const { workerData, parentPort } = require('node:worker_threads');
console.log = console.warn = console.error = () => {};
const libheif = require('libheif-js'); // Pure JavaScript build, no SIMD requirement.
(async () => {
    let images = [];
    try {
        const bytes = Buffer.from(workerData.bytes);
        if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error('Invalid image');
        images = new libheif.HeifDecoder().decode(bytes);
        if (!images.length) throw new Error('Invalid image');
        const image = images[0];
        const width = image.get_width(), height = image.get_height();
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 25_000_000) throw new Error('Image too large');
        if (workerData.metadataOnly) {
            parentPort.postMessage({ data: Buffer.from(`${width} ${height}`) });
        } else {
            let pixels;
            if (workerData.format === 'avif') {
                const avif = await import('@jsquash/avif/decode.js');
                const wasm = require('node:fs').readFileSync(require.resolve('@jsquash/avif/codec/dec/avif_dec.wasm'));
                await avif.init(new WebAssembly.Module(wasm));
                pixels = await avif.default(bytes);
                if (pixels.width !== width || pixels.height !== height) throw new Error('Inconsistent dimensions');
            } else {
                pixels = await new Promise((resolve, reject) => image.display({ width, height, data: new Uint8ClampedArray(width * height * 4) }, data => data ? resolve(data) : reject(new Error('Decode failed'))));
            }
            parentPort.postMessage({ data: PNG.sync.write({ width, height, data: Buffer.from(pixels.data) }) });
        }
    } catch {
        parentPort.postMessage({ error: true });
    } finally {
        for (const image of images) image.free();
    }
})();
