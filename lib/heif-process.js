// Isolated, CPU-portable HEIF/AVIF decoder for the ImageMagick backend.
// The parent caps input/output, kills timed-out jobs and receives no decoder logs.
const { PNG } = require('pngjs');
console.log = console.warn = console.error = () => {};
const libheif = require('libheif-js'); // Pure JavaScript build, no SIMD requirement.
const chunks = [];
let size = 0;
process.stdin.on('data', chunk => {
    size += chunk.length;
    if (size > 50 * 1024 * 1024) process.exit(1);
    chunks.push(chunk);
});
process.stdin.on('end', async () => {
    let images = [];
    try {
        images = new libheif.HeifDecoder().decode(Buffer.concat(chunks));
        if (!images.length) throw new Error('Invalid image');
        const image = images[0];
        const width = image.get_width(), height = image.get_height();
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 25_000_000) throw new Error('Image too large');
        if (process.argv[2] === 'metadata') {
            process.stdout.write(`${width} ${height}`);
        } else {
            let pixels;
            if (process.argv[3] === 'avif') {
                const avif = await import('@jsquash/avif/decode.js');
                const wasm = require('node:fs').readFileSync(require.resolve('@jsquash/avif/codec/dec/avif_dec.wasm'));
                await avif.init(new WebAssembly.Module(wasm));
                pixels = await avif.default(Buffer.concat(chunks));
                if (pixels.width !== width || pixels.height !== height) throw new Error('Inconsistent dimensions');
            } else {
                pixels = await new Promise((resolve, reject) => image.display({ width, height, data: new Uint8ClampedArray(width * height * 4) }, data => data ? resolve(data) : reject(new Error('Decode failed'))));
            }
            process.stdout.write(PNG.sync.write({ width, height, data: Buffer.from(pixels.data) }));
        }
    } catch {
        process.exitCode = 1;
    } finally {
        for (const image of images) image.free();
    }
});
