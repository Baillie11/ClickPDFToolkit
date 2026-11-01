const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PNG } = require('pngjs');
const images = require('../lib/images');
const fixture = name => fs.readFile(path.join(__dirname, 'fixtures', name));

test('image backend preserves supported formats, dimensions and visible colours', async () => {
    for (const format of ['png', 'jpeg', 'gif', 'webp', 'tiff', 'avif']) {
        const input = await fixture(`sample.${format}`);
        const metadata = await images.metadata(input);
        assert.equal(metadata.width, 120, format);
        assert.equal(metadata.height, 80, format);
        const png = PNG.sync.read(await images.toPng(input));
        assert.equal(png.width, 120, format);
        assert.equal(png.height, 80, format);
        // Lossy inputs vary slightly; catch colour-channel or blank-output regressions.
        for (const [channel, expected] of [37, 99, 235, 255].entries()) assert.ok(Math.abs(png.data[channel] - expected) < 12, `${format} channel ${channel}`);
    }
});

test('image backend preserves transparency and uses only the first animated frame', async () => {
    const transparent = PNG.sync.read(await images.toPng(await fixture('transparent.png')));
    assert.ok(Math.abs(transparent.data[3] - 128) <= 1);
    const first = PNG.sync.read(await images.toPng(await fixture('animated.gif')));
    assert.equal(first.height, 8);
    assert.equal(first.width, 8);
    assert.equal(first.data[0], 255);
    assert.equal(first.data[2], 0);
});

test('compatibility format gate rejects document/script formats and oversized images', async () => {
    for (const value of ['<svg xmlns="http://www.w3.org/2000/svg"/>', '%PDF-1.7', 'https://example.com/a.png', 'push graphic-context', '']) {
        assert.throws(() => images.formatOf(Buffer.from(value)));
    }
    assert.throws(() => images.formatOf(Buffer.alloc(50 * 1024 * 1024 + 1)));
    // A valid header with a forged huge dimension must never reach pixel decoding.
    const png = await fixture('sample.png');
    png.writeUInt32BE(1000000, 16);
    await assert.rejects(images.metadata(png));
    await assert.rejects(images.toPng(png));
});
