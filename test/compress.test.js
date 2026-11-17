const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { PDFDocument, PDFName, PDFRawStream } = require('pdf-lib');
const { compressPdf } = require('../lib/compress');
const { createApp } = require('../server');

const { sample } = require('./fixtures/compress-sample.cjs');

test('compress reduces embedded PNG and JPEG images while retaining text streams, forms and geometry', async () => {
    for (const kind of ['png', 'jpeg']) {
        const input = await sample(kind);
        const result = await compressPdf(input, 'balanced', null);
        assert.ok(result.bytes.length < input.length * 0.8, `${kind}: ${input.length} -> ${result.bytes.length}`);
        assert.equal(result.optimisedImages, 1);
        const source = await PDFDocument.load(input), output = await PDFDocument.load(result.bytes);
        assert.equal(output.getTitle(), 'Compression fixture');
        assert.deepEqual(output.getPages().map(p => [p.getWidth(), p.getHeight(), p.getRotation().angle]), [[595, 842, 0], [420, 595, 90]]);
        assert.equal(output.getForm().getTextField('customer').getText(), 'Example Customer');
        for (let i = 0; i < source.getPageCount(); i++) {
            const content = source.getPage(i).node.Contents();
            if (!content) continue;
            for (const ref of content.asArray()) {
                assert.deepEqual(output.context.lookup(ref).contents, source.context.lookup(ref).contents, 'page drawing/text stream must be unchanged');
            }
        }
        assert.ok(output.context.enumerateIndirectObjects().some(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Filter')) === PDFName.of('DCTDecode')));
    }
});

test('compression targets are best effort and never enlarge or unnecessarily rewrite a file', async () => {
    const input = await sample();
    const quality = await compressPdf(input, 'quality', null);
    const smallest = await compressPdf(input, 'smallest', null);
    assert.ok(smallest.bytes.length < quality.bytes.length);
    const target = Math.floor((quality.bytes.length + smallest.bytes.length) / 2);
    const targeted = await compressPdf(input, 'quality', target);
    assert.ok(targeted.bytes.length <= target);
    assert.notEqual(targeted.presetUsed, 'quality');
    const impossible = await compressPdf(input, 'quality', 10);
    assert.ok(impossible.bytes.length > 10);
    assert.ok(impossible.bytes.length <= smallest.bytes.length);
    const met = await compressPdf(input, 'balanced', input.length);
    assert.deepEqual(met.bytes, input);
    const blank = await PDFDocument.create(); blank.addPage();
    const compact = Buffer.from(await blank.save());
    const unchanged = await compressPdf(compact, 'balanced', null);
    assert.ok(unchanged.bytes.length <= compact.length);
});

test('compression rejects malformed, encrypted, signed and excessive-page documents and supports cancellation', async () => {
    await assert.rejects(compressPdf(Buffer.from('%PDF-broken'), 'balanced', null), /valid, unencrypted/);
    const signed = await PDFDocument.create(); signed.addPage();
    signed.context.register(signed.context.obj({ Type: 'Sig', ByteRange: [0, 1, 2, 3] }));
    await assert.rejects(compressPdf(await signed.save(), 'balanced', null), /Digitally signed/);
    const encrypted = await PDFDocument.create(); encrypted.addPage();
    encrypted.context.trailerInfo.Encrypt = encrypted.context.register(encrypted.context.obj({ Filter: 'Standard' }));
    await assert.rejects(compressPdf(await encrypted.save(), 'balanced', null), /unencrypted/);
    const many = await PDFDocument.create(); for (let i = 0; i < 1001; i++) many.addPage();
    await assert.rejects(compressPdf(await many.save(), 'balanced', null), /1,000 pages/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(compressPdf(Buffer.from('%PDF-broken'), 'balanced', null, controller.signal), /cancelled/);
});

test('compression API validates options, protects chained results and cleans inputs', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clickpdf-compress-'));
    const app = createApp({ storageRoot: root, basePath: '/clickpdf' });
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { app.get('closeSecurity')(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
    const url = `http://127.0.0.1:${server.address().port}`;
    let cookie;
    const input = await sample();
    async function post(fields = {}, file = input, own = true) {
        const body = new FormData();
        if (file) body.append('pdf', new Blob([file], { type: 'application/pdf' }), 'sample.pdf');
        for (const [key, value] of Object.entries(fields)) body.append(key, value);
        const response = await fetch(url + '/clickpdf/api/compress', { method: 'POST', body, headers: own && cookie ? { Cookie: cookie } : {} });
        if (own && response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return { response, data: await response.json() };
    }
    const first = await post({ preset: 'balanced', targetMB: '0.1' });
    assert.equal(first.response.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.targetMet, first.data.outputBytes <= 100000);
    assert.equal(first.data.savedBytes, first.data.originalBytes - first.data.outputBytes);
    assert.ok(first.data.downloadUrl.startsWith('/clickpdf/download/'));
    assert.equal((await fetch(url + first.data.downloadUrl)).status, 404);
    assert.equal((await fetch(url + first.data.downloadUrl, { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await post({ sourceFilename: first.data.filename }, null)).response.status, 200);
    assert.equal((await post({ sourceFilename: first.data.filename }, null, false)).response.status, 400);
    assert.equal((await post({ sourceFilename: '../server.js' }, null)).response.status, 400);
    assert.equal((await post({ sourceFilename: first.data.filename })).response.status, 400);
    for (const fields of [{ preset: 'invalid' }, { targetMB: '-1' }, { targetMB: 'Infinity' }, { targetMB: '51' }, { targetMB: '0.01' }]) assert.equal((await post(fields)).response.status, 400);
    assert.equal((await post({}, null)).response.status, 400);
    assert.equal((await post({}, Buffer.from('%PDF-broken'))).response.status, 400);
    for (let i = 0; i < 100 && (await fs.readdir(path.join(root, 'uploads'))).length; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(await fs.readdir(path.join(root, 'uploads')), []);
    assert.equal((await fs.readdir(path.join(root, 'output'))).length, 2);
});

