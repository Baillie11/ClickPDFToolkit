const { PDFDocument, degrees } = require('pdf-lib');
const { PNG } = require('pngjs');
async function sample(kind = 'png') {
    const width = 900, height = 1200;
    const pixels = Buffer.alloc(width * height * 4);
    let seed = 12345;
    for (let i = 0; i < width * height; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const x = i % width, y = Math.floor(i / width), grain = seed % 45;
        pixels[4 * i] = Math.min(255, 80 + Math.floor(x / 6) + grain);
        pixels[4 * i + 1] = Math.min(255, 70 + Math.floor(y / 8) + grain);
        pixels[4 * i + 2] = 100 + grain;
        pixels[4 * i + 3] = 255;
    }
    const png = PNG.sync.write({ width, height, data: pixels });
    const doc = await PDFDocument.create();
    const image = kind === 'jpeg' ? await doc.embedJpg(await require('../../lib/images').toJpeg(png, { quality: 98, maxSide: 2400 })) : await doc.embedPng(png);
    const page = doc.addPage([595, 842]);
    page.drawText('Click PDF compression test - selectable text', { x: 30, y: 790, size: 17 });
    page.drawImage(image, { x: 40, y: 130, width: 510, height: 630 });
    const field = doc.getForm().createTextField('customer');
    field.setText('Example Customer'); field.addToPage(page, { x: 40, y: 70, width: 240, height: 30 });
    doc.addPage([420, 595]).setRotation(degrees(90));
    doc.setTitle('Compression fixture');
    return Buffer.from(await doc.save());
}

module.exports = { sample };
