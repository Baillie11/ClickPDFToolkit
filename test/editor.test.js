const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { createApp } = require('../server');

async function fixture(t, options = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clickpdf-editor-'));
    const app = createApp({ storageRoot: root, rateLimit: 1000, ...options });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => {
        app.get('closeSecurity')();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await fs.rm(root, { recursive: true, force: true });
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    let cookie;
    async function edit(fields = {}, pdf) {
        const body = new FormData();
        for (const [name, value] of Object.entries(fields)) body.append(name, typeof value === 'string' ? value : JSON.stringify(value));
        if (pdf) body.append('pdf', new Blob([pdf], { type: 'application/pdf' }), 'sample.pdf');
        const response = await fetch(url + '/api/edit', { method: 'POST', body, headers: cookie ? { Cookie: cookie } : {} });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { response, data: await response.json() };
    }
    async function download(data) {
        const response = await fetch(url + data.downloadUrl, { headers: { Cookie: cookie } });
        assert.equal(response.status, 200);
        return new Uint8Array(await response.arrayBuffer());
    }
    async function uploadsEmpty() {
        for (let attempt = 0; attempt < 100; attempt++) {
            if ((await fs.readdir(path.join(root, 'uploads'))).length === 0) return;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.deepEqual(await fs.readdir(path.join(root, 'uploads')), []);
    }
    return { url, root, edit, download, uploadsEmpty };
}

async function inputs() {
    const png = await sharp({ create: { width: 120, height: 80, channels: 4, background: '#2563eb' } }).png().toBuffer();
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    doc.addPage([300, 400]);
    return { dataUrl: 'data:image/png;base64,' + png.toString('base64'), pdf: await doc.save() };
}

test('editor operations (text, symbols, images, shapes, strokes, text edits) produce a valid edited PDF', async t => {
    const f = await fixture(t);
    const { pdf, dataUrl } = await inputs();
    const { response, data } = await f.edit({
        annotations: [
            { text: 'Approved by Zoe Smith', x: 10, y: 10, page: 1, fontSize: 14, color: '#112233' },
            { text: 'Caf\u00e9 \u2013 \u4e2d\u6587\nsecond line', x: 10, y: 20, page: 1, fontSize: 12, color: '#000000' },
            { text: '\u2713', x: 50, y: 50, page: 2, fontSize: 18, color: '#16a34a' },
            { text: '\u2717', x: 60, y: 50, page: 2, fontSize: 18, color: '#dc2626' }
        ],
        signatures: [
            { imageData: dataUrl, x: 60, y: 80, page: 1, widthPct: 20, heightPct: 6 },
            { imageData: dataUrl, x: 10, y: 80, page: 2, widthPct: 25, heightPct: 8 }
        ],
        rectangles: [
            { type: 'highlight', x: 5, y: 5, w: 40, h: 4, page: 1, color: '#fbbf24', opacity: 40 },
            { type: 'whiteout', x: 5, y: 30, w: 20, h: 5, page: 1, color: '#ffffff', opacity: 100 }
        ],
        drawStrokes: [{ page: 1, color: '#ff0000', size: 3, points: [[10, 60], [20, 62], [30, 58], [40, 64]] }],
        textEdits: [{ page: 1, originalText: 'old', newText: 'Replacement text', pdfX: 72, pdfY: 700, pdfWidth: 90, fontSize: 12 }],
        outputFilename: 'edited'
    }, pdf);
    assert.equal(response.status, 200);
    assert.match(data.downloadUrl, /^\/download\/edited-/);
    const edited = await PDFDocument.load(await f.download(data));
    assert.equal(edited.getPageCount(), 2);
    assert.equal(edited.getPage(1).getWidth(), 300);
    // The same (opaque) image is placed twice but embedded once.
    const imageObjects = edited.context.enumerateIndirectObjects().filter(([, object]) => object.dict?.get(edited.context.obj('Subtype'))?.toString() === '/Image');
    assert.equal(imageObjects.length, 1);
    await f.uploadsEmpty();
});

test('editor input is validated before anything is drawn and failures leak nothing', async t => {
    const f = await fixture(t);
    const { pdf, dataUrl } = await inputs();
    const ok = { text: 'x', x: 1, y: 1, page: 1, fontSize: 12, color: '#000000' };
    const manyPoints = Array.from({ length: 20001 }, (_, i) => [i % 100, (i * 7) % 100]);
    const cases = [
        { annotations: '{not json' },
        { annotations: { not: 'an array' } },
        { annotations: [{ ...ok, page: 3 }] },
        { annotations: [{ ...ok, page: 1.5 }] },
        { annotations: [{ ...ok, color: '<script>' }] },
        { annotations: [{ ...ok, fontSize: 1000 }] },
        { annotations: [{ ...ok, x: 'NaN' }] },
        { annotations: [{ ...ok, text: 'a'.repeat(10001) }] },
        { annotations: Array.from({ length: 201 }, () => ok) },
        { signatures: [{ imageData: 'data:image/svg+xml;base64,PHN2Zz4=', x: 1, y: 1, page: 1, widthPct: 10, heightPct: 10 }] },
        { signatures: [{ imageData: 'data:image/png;base64,AAAA', x: 1, y: 1, page: 1, widthPct: 10, heightPct: 10 }] },
        { signatures: [{ imageData: dataUrl, x: 1, y: 1, page: 1, widthPct: 0, heightPct: 10 }] },
        { rectangles: [{ type: 'delete', x: 1, y: 1, w: 5, h: 5, page: 1, color: '#ffffff', opacity: 100 }] },
        { rectangles: [{ type: 'highlight', x: 1, y: 1, w: 5, h: 5, page: 1, color: '#fff', opacity: 100 }] },
        { drawStrokes: [{ page: 1, color: '#000000', size: 3, points: [[1, 1]] }] },
        { drawStrokes: [{ page: 1, color: '#000000', size: 3, points: [[1, 'x'], [2, 2]] }] },
        { drawStrokes: [{ page: 1, color: '#000000', size: 3, points: manyPoints }] },
        { textEdits: [{ page: 1, newText: 'x', pdfX: 1, pdfY: 1, pdfWidth: 1, fontSize: 0 }] }
    ];
    for (const fields of cases) {
        const { response, data } = await f.edit(fields, pdf);
        assert.equal(response.status, 400, JSON.stringify(fields).slice(0, 120));
        assert.doesNotMatch(JSON.stringify(data), /Error:|node_modules|C:\\|at /);
        await f.uploadsEmpty();
    }
    assert.deepEqual(await fs.readdir(path.join(f.root, 'output')), []);
});

test('pdf.js is served locally and the markup avoids everything the strict CSP blocks', async t => {
    const f = await fixture(t);
    for (const asset of ['vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js']) {
        const response = await fetch(`${f.url}/${asset}`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /javascript/);
    }
    const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
    const app = await fs.readFile(path.join(__dirname, '../public/js/app.js'), 'utf8');
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'inline event handlers are blocked by script-src-attr none');
    assert.doesNotMatch(html, /\sstyle\s*=/i, 'inline style attributes are blocked by style-src self');
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)/i, 'inline scripts are blocked by script-src self');
    for (const [, source] of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) {
        assert.doesNotMatch(source, /^(?:[a-z]+:)?\/\//i, 'scripts must be same-origin');
        await fs.access(path.join(__dirname, '../public', source));
    }
    assert.doesNotMatch(app, /\son(?:click|input|change)=/, 'generated markup must not use inline handlers');
    assert.doesNotMatch(app, /\sstyle="/, 'generated markup must not use inline styles');
    // Every data-action in the page must be wired into the delegated click handler.
    const actionsBlock = /const actions = \{([^}]*)\}/.exec(app)[1];
    const wired = new Set(actionsBlock.split(',').map(name => name.trim()).filter(Boolean));
    for (const [, name] of html.matchAll(/data-action="(\w+)"/g)) assert.ok(wired.has(name), `${name} is not wired in app.js`);
    for (const name of ['deleteAnnotation', 'deleteSignature']) assert.ok(wired.has(name));
});
