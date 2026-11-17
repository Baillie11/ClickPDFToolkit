const { parentPort, workerData } = require('node:worker_threads');
const { inflateSync } = require('node:zlib');
const { PDFDocument, PDFRawStream, PDFName, PDFNumber, PDFDict } = require('pdf-lib');
const { PNG } = require('pngjs');
const JpegEmbedder = require('pdf-lib/cjs/core/embedders/JpegEmbedder').default;
const images = require('./images');
const name = PDFName.of;
const presets = { quality: { quality: 85, maxSide: 2400 }, balanced: { quality: 70, maxSide: 1600 }, smallest: { quality: 45, maxSide: 1000 } };

async function compress(bytes, preset, targetBytes) {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
    const pageCount = doc.getPageCount();
    if (!pageCount || pageCount > 1000) throw new Error('Use a PDF with 1 to 1,000 pages.');
    const entries = doc.context.enumerateIndirectObjects();
    // Rewriting signed documents would invalidate their certificates.
    for (const [, object] of entries) {
        const dict = object instanceof PDFDict ? object : object instanceof PDFRawStream ? object.dict : null;
        if (dict && (dict.has(name('ByteRange')) || dict.get(name('Type')) === name('Sig') || dict.get(name('FT')) === name('Sig'))) {
            throw new Error('Digitally signed PDFs cannot be compressed. Use an unsigned original.');
        }
    }
    if (targetBytes && bytes.length <= targetBytes) return { bytes, pageCount, optimisedImages: 0, presetUsed: preset };
    const candidates = [];
    let pixels = 0;
    for (const [ref, object] of entries) {
        if (!(object instanceof PDFRawStream) || object.dict.lookup(name('Subtype')) !== name('Image')) continue;
        const d = object.dict;
        const width = d.lookup(name('Width')), height = d.lookup(name('Height'));
        const colour = d.lookup(name('ColorSpace')), filter = d.lookup(name('Filter'));
        const supported = width instanceof PDFNumber && height instanceof PDFNumber &&
            Number.isInteger(width.asNumber()) && Number.isInteger(height.asNumber()) && width.asNumber() > 0 && height.asNumber() > 0 &&
            d.lookup(name('BitsPerComponent'))?.asNumber?.() === 8 &&
            [name('DeviceRGB'), name('DeviceGray')].includes(colour) &&
            [name('DCTDecode'), name('FlateDecode')].includes(filter) &&
            !['SMask', 'Mask', 'ImageMask', 'Decode', 'DecodeParms', 'Alternates', 'OPI', 'SMaskInData'].some(key => d.has(name(key)));
        if (!supported || width.asNumber() * height.asNumber() > 25_000_000 || object.contents.length < 4096) continue;
        pixels += width.asNumber() * height.asNumber();
        if (pixels > 50_000_000 || candidates.length >= 100) continue;
        candidates.push({ ref, object, width: width.asNumber(), height: height.asNumber(), gray: colour === name('DeviceGray'), flate: filter === name('FlateDecode') });
    }
    let best = bytes, optimisedImages = 0, presetUsed = preset;
    const levels = ['quality', 'balanced', 'smallest'];
    const attempts = targetBytes ? levels.slice(levels.indexOf(preset)) : [preset];
    for (const level of attempts) {
        let changed = 0;
        for (const candidate of candidates) {
            const { ref, object, width, height, gray, flate } = candidate;
            // Always retry from original pixels, avoiding cumulative JPEG loss.
            doc.context.assign(ref, object);
            try {
                let input = Buffer.from(object.contents);
                if (flate) {
                    const channels = gray ? 1 : 3;
                    const raw = inflateSync(input, { maxOutputLength: width * height * channels });
                    if (raw.length !== width * height * channels) throw new Error('Invalid image');
                    const rgba = Buffer.alloc(width * height * 4);
                    for (let i = 0; i < width * height; i++) {
                        rgba[4 * i] = raw[channels * i];
                        rgba[4 * i + 1] = raw[channels * i + (gray ? 0 : 1)];
                        rgba[4 * i + 2] = raw[channels * i + (gray ? 0 : 2)];
                        rgba[4 * i + 3] = 255;
                    }
                    input = PNG.sync.write({ width, height, data: rgba });
                }
                const info = await images.metadata(input);
                if (info.width !== width || info.height !== height || (!flate && info.channels && info.channels !== (gray ? 1 : 3))) continue;
                const jpeg = await images.toJpeg(input, presets[level]);
                if (jpeg.length >= object.contents.length) continue;
                const encoded = await JpegEmbedder.for(Uint8Array.from(jpeg));
                const dict = object.dict.clone(doc.context);
                dict.set(name('Width'), PDFNumber.of(encoded.width));
                dict.set(name('Height'), PDFNumber.of(encoded.height));
                dict.set(name('ColorSpace'), name(encoded.colorSpace));
                dict.set(name('Filter'), name('DCTDecode'));
                doc.context.assign(ref, PDFRawStream.of(dict, jpeg));
                changed++;
            } catch { /* Keep unsupported images byte-for-byte. */ }
        }
        const output = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
        if (output.length < best.length) { best = output; optimisedImages = changed; presetUsed = level; }
        if (!targetBytes || best.length <= targetBytes) break;
    }
    return { bytes: best, pageCount, optimisedImages, presetUsed };
}

compress(Buffer.from(workerData.bytes), workerData.preset, workerData.targetBytes)
    .then(result => parentPort.postMessage(result))
    .catch(error => parentPort.postMessage({ error: /^(Use a PDF|Digitally signed)/.test(error.message) ? error.message : 'Could not compress this document. Use a valid, unencrypted PDF.' }));
