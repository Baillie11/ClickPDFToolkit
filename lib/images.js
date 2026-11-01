const { spawn } = require('node:child_process');
const path = require('node:path');

const IMAGE_OPTIONS = { limitInputPixels: 25_000_000 };
const backend = process.env.IMAGE_BACKEND || 'sharp';
if (!['sharp', 'imagemagick'].includes(backend)) throw new Error('Invalid IMAGE_BACKEND');
// Do not load native Sharp when an operator selects the compatible backend.
const sharp = backend === 'sharp' ? require('sharp') : null;

function formatOf(bytes) {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error('Invalid image size');
    if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
    if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'gif';
    if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (['49492a00', '4d4d002a', '49492b00', '4d4d002b'].includes(bytes.subarray(0, 4).toString('hex'))) return 'tiff';
    if (bytes.toString('ascii', 4, 8) === 'ftyp') {
        const brand = bytes.toString('ascii', 8, 12);
        if (['avif', 'avis'].includes(brand)) return 'avif';
        if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heif';
    }
    throw new Error('Unsupported image format');
}

function convert(bytes, format, metadataOnly) {
    const heif = format === 'avif' || format === 'heif';
    const executable = heif ? process.execPath : process.env.IMAGEMAGICK_BINARY || '/usr/bin/convert';
    if (!path.isAbsolute(executable)) throw new Error('IMAGEMAGICK_BINARY must be an absolute path');
    // Input filenames, command options and output paths never come from uploads.
    const args = ['-limit', 'thread', '1', '-limit', 'memory', '384MiB', '-limit', 'map', '0', '-limit', 'disk', '0', '-limit', 'time', '20'];
    if (metadataOnly) args.push('-ping');
    args.push(`${format === 'heif' ? 'heic' : format}:-[0]`);
    args.push(...(metadataOnly ? ['-format', '%w %h', 'info:'] : ['-colorspace', 'sRGB', '-strip', '-depth', '8', 'png:-']));
    return new Promise((resolve, reject) => {
        const childArgs = heif ? ['--max-old-space-size=384', path.join(__dirname, 'heif-process.js'), metadataOnly ? 'metadata' : 'png', format] : args;
        const child = spawn(executable, childArgs, {
            shell: false, windowsHide: true,
            env: { ...process.env, MAGICK_CONFIGURE_PATH: path.join(__dirname, 'imagemagick'), MAGICK_THREAD_LIMIT: '1' },
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let size = 0;
        let failed = false;
        const chunks = [];
        const fail = () => { failed = true; child.kill('SIGKILL'); };
        const timer = setTimeout(fail, 25_000);
        child.stdout.on('data', chunk => {
            size += chunk.length;
            if (size > (metadataOnly ? 128 : 100 * 1024 * 1024)) return fail();
            if (!failed) chunks.push(chunk);
        });
        // Decoder messages can contain untrusted metadata. Do not expose or retain them.
        child.stderr.resume();
        child.stdin.on('error', () => {}); // An early decoder rejection can close stdin.
        child.on('error', () => { clearTimeout(timer); reject(new Error('Image processor unavailable')); });
        child.on('close', code => {
            clearTimeout(timer);
            if (failed || code !== 0) return reject(new Error('Image processing failed or exceeded limits'));
            resolve(Buffer.concat(chunks));
        });
        child.stdin.end(bytes);
    });
}

async function metadata(bytes) {
    if (sharp) return sharp(bytes, IMAGE_OPTIONS).metadata();
    const format = formatOf(bytes);
    const result = (await convert(bytes, format, true)).toString().trim();
    const match = /^(\d+) (\d+)$/.exec(result);
    if (!match) throw new Error('Invalid image dimensions');
    const width = Number(match[1]), height = Number(match[2]);
    if (!width || !height || width * height > IMAGE_OPTIONS.limitInputPixels) throw new Error('Image dimensions exceed limit');
    return { format, width, height };
}

async function toPng(bytes) {
    if (sharp) return sharp(bytes, IMAGE_OPTIONS).png().toBuffer();
    // Ping before decoding: area limits alone allow disk spill, not pixel rejection.
    const info = await metadata(bytes);
    return convert(bytes, info.format, false);
}

module.exports = { metadata, toPng, IMAGE_OPTIONS, formatOf };
