const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const vm = require('node:vm');
const { once } = require('node:events');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { createApp } = require('../server');

async function fixture(t, options = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clickpdf-test-'));
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
    async function post(route, fields = {}, files = [], headers = {}) {
        const body = new FormData();
        for (const [name, value] of Object.entries(fields)) body.append(name, value);
        for (const [name, data, filename, type] of files) body.append(name, new Blob([data], { type }), filename);
        const response = await fetch(url + route, { method: 'POST', body, headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { response, data: await response.json() };
    }
    async function uploadsEmpty() {
        // Response delivery can precede the final async cleanup by one event-loop turn.
        for (let attempt = 0; attempt < 100; attempt++) {
            if ((await fs.readdir(path.join(root, 'uploads'))).length === 0) return;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.deepEqual(await fs.readdir(path.join(root, 'uploads')), []);
    }
    return { app, server, url, root, post, uploadsEmpty, cookie: () => cookie };
}

async function inputs() {
    const png = await sharp({ create: { width: 120, height: 80, channels: 4, background: '#2563eb' } }).png().toBuffer();
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]); doc.addPage([595, 842]);
    return { png, pdf: await doc.save() };
}

test('all existing workflows generate PDFs; downloads require the creating session', async t => {
    const f = await fixture(t);
    const { png, pdf } = await inputs();
    let firstCookie;
    const images = [['png', png], ['jpeg', await sharp(png).jpeg().toBuffer()], ['gif', await sharp(png).gif().toBuffer()], ['webp', await sharp(png).webp().toBuffer()]];
    for (const fitMode of ['fit', 'fill', 'stretch']) {
        const { response, data } = await f.post('/api/image-to-pdf', { fitMode, margin: '0', pageSize: 'Letter', orientation: 'landscape', outputFilename: 'safe name' }, images.map(([format, bytes]) => ['images', bytes, `sample.${format}`, `image/${format}`]));
        assert.equal(response.status, 200);
        assert.equal(data.pageCount, 4);
        assert.match(response.headers.get('set-cookie') || f.cookie(), /clickpdf_session=/);
        firstCookie = f.cookie();
        const result = await fetch(f.url + data.downloadUrl, { headers: { Cookie: f.cookie() } });
        assert.equal(result.status, 200);
        assert.match(result.headers.get('content-disposition'), /^attachment/);
        assert.equal(result.headers.get('cache-control'), 'no-store');
        const generated = await PDFDocument.load(await result.arrayBuffer());
        assert.equal(generated.getPageCount(), 4);
        assert.equal(generated.getPage(0).getWidth(), 792);
        assert.equal((await fetch(f.url + data.downloadUrl)).status, 404);
        assert.equal((await fetch(f.url + data.downloadUrl, { headers: { Cookie: 'clickpdf_session=' + '0'.repeat(64) } })).status, 404);
    }
    const file = ['pdf', pdf, 'sample.pdf', 'application/pdf'];
    const cases = [
        ['/api/edit', { text: 'Reviewed', pageNumber: '2', textX: '0', textY: '0' }, [file, ['overlayImage', png, 'overlay.png', 'image/png']]],
        ['/api/sign', { pageNumber: '2' }, [file, ['signatureImage', png, 'sig.png', 'image/png']]],
        ['/api/sign', { signatureData: 'data:image/png;base64,' + png.toString('base64') }, [file]]
    ];
    for (const [route, fields, files] of cases) {
        const { response, data } = await f.post(route, fields, files);
        assert.equal(response.status, 200);
        const download = await fetch(f.url + data.downloadUrl, { headers: { Cookie: f.cookie() } });
        assert.equal((await PDFDocument.load(await download.arrayBuffer())).getPageCount(), 2);
        await f.uploadsEmpty();
    }
    const other = await f.post('/api/image-to-pdf', {}, [['images', png, 'test.png', 'image/png']], { Cookie: '' });
    const result = await fetch(f.url + other.data.downloadUrl, { headers: { Cookie: firstCookie } });
    assert.equal(result.status, 404);
});

test('malformed documents, fields and signatures are rejected without retained uploads or leaked errors', async t => {
    const f = await fixture(t);
    const { png, pdf } = await inputs();
    const file = ['pdf', pdf, 'sample.pdf', 'application/pdf'];
    const cases = [
        ['/api/edit', {}, [['pdf', Buffer.from('not PDF'), 'private-name.pdf', 'application/pdf']]],
        ['/api/edit', {}, [['pdf', Buffer.from('%PDF-corrupt'), 'private-name.pdf', 'application/pdf']]],
        ['/api/edit', { pageNumber: '99' }, [file, ['overlayImage', png, 'image.png', 'image/png']]],
        ['/api/edit', { textX: 'Infinity' }, [file]],
        ['/api/edit', { textColor: '<script>' }, [file]],
        ['/api/edit', { pageNumber: '0' }, [file]],
        ['/api/sign', {}, [file]],
        ['/api/sign', { signatureData: 'data:image/svg+xml;base64,PHN2Zz4=' }, [file]],
        ['/api/image-to-pdf', {}, [['images', Buffer.from('<svg/>'), 'image.png', 'image/png']]],
        ['/api/image-to-pdf', { margin: '-1' }, [['images', png, 'image.png', 'image/png']]],
        ['/api/image-to-pdf', { outputFilename: 'a'.repeat(101) }, [['images', png, 'image.png', 'image/png']]]
    ];
    for (const [route, fields, files] of cases) {
        const { response, data } = await f.post(route, fields, files);
        assert.equal(response.status, 400);
        assert.doesNotMatch(JSON.stringify(data), /private-name|Error:|node_modules|C:\\/);
        await f.uploadsEmpty();
    }
    assert.deepEqual(await fs.readdir(path.join(f.root, 'output')), []);
});

test('all placeholders return 501 without persisting uploaded documents', async t => {
    const f = await fixture(t);
    const { pdf } = await inputs();
    for (const route of ['merge', 'split', 'compress', 'pdf-to-word', 'word-to-pdf', 'pdf-to-ppt', 'ppt-to-pdf', 'pdf-to-excel', 'excel-to-pdf', 'pdf-to-image', 'watermark', 'rotate', 'html-to-pdf', 'unlock', 'protect', 'ocr', 'extract-text', 'reorder']) {
        assert.equal((await f.post('/api/' + route, {}, [['pdf', pdf, 'sample.pdf', 'application/pdf']])).response.status, 501);
    }
    await f.uploadsEmpty();
});

test('host, origin, fetch metadata and security headers protect local browser access', async t => {
    const f = await fixture(t);
    const { png } = await inputs();
    const home = await fetch(f.url);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /script-src-attr 'none'/);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal(home.headers.get('access-control-allow-origin'), null);
    assert.equal((await f.post('/api/image-to-pdf', {}, [], { Origin: 'https://attacker.example' })).response.status, 403);
    assert.equal((await f.post('/api/image-to-pdf', {}, [], { 'Sec-Fetch-Site': 'cross-site' })).response.status, 403);
    const hostStatus = await new Promise((resolve, reject) => {
        const request = http.get(f.url, { headers: { Host: 'attacker.example' } }, response => {
            response.resume();
            resolve(response.statusCode);
        });
        request.on('error', reject);
    });
    assert.equal(hostStatus, 403);
    const accepted = await f.post('/api/image-to-pdf', {}, [['images', png, 'sample.png', 'image/png']], { Origin: f.url });
    assert.equal(accepted.response.status, 200);
    assert.match(accepted.response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(accepted.response.headers.get('set-cookie'), /SameSite=Strict/i);
    await f.uploadsEmpty();
});

test('file, aggregate, field and request-rate limits reject abusive requests and clean partial writes', async t => {
    const { png } = await inputs();
    const f = await fixture(t, { maxFileSize: 512, maxTotalSize: png.length + 1 });
    assert.equal((await f.post('/api/image-to-pdf', {}, [['images', Buffer.alloc(513), 'oversize.png', 'image/png']])).response.status, 413);
    await f.uploadsEmpty();
    assert.equal((await f.post('/api/image-to-pdf', {}, [['images', png, 'one.png', 'image/png'], ['images', png, 'two.png', 'image/png']])).response.status, 413);
    await f.uploadsEmpty();
    assert.equal((await f.post('/api/sign', { signatureData: 'x'.repeat(1024 * 1024 + 1) }, [])).response.status, 413);
    await f.uploadsEmpty();
    const limited = await fixture(t, { rateLimit: 1 });
    assert.equal((await limited.post('/api/merge')).response.status, 501);
    const rejected = await limited.post('/api/merge');
    assert.equal(rejected.response.status, 429);
    assert.ok(Number(rejected.response.headers.get('retry-after')) > 0);
});

test('expired output cannot be downloaded and stale files are removed', async t => {
    const f = await fixture(t, { ttl: 2000 });
    const { png } = await inputs();
    const { data, response } = await f.post('/api/image-to-pdf', {}, [['images', png, 'sample.png', 'image/png']]);
    assert.equal(response.status, 200);
    await f.uploadsEmpty();
    await new Promise(resolve => setTimeout(resolve, 2100));
    assert.equal((await fetch(f.url + data.downloadUrl, { headers: { Cookie: f.cookie() } })).status, 404);
    // Exercise the same cleanup implementation used by the startup/periodic timer.
    await f.app.get('cleanupFiles')();
    assert.deepEqual(await fs.readdir(path.join(f.root, 'output')), []);
});

test('aborted multipart upload releases concurrency slot and removes partial file', async t => {
    const f = await fixture(t, { maxConcurrent: 1 });
    const socket = net.connect(f.server.address().port, '127.0.0.1');
    await once(socket, 'connect');
    socket.write('POST /api/image-to-pdf HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: multipart/form-data; boundary=test\r\nContent-Length: 100000\r\n\r\n--test\r\nContent-Disposition: form-data; name="images"; filename="sample.png"\r\nContent-Type: image/png\r\n\r\npartial');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal((await f.post('/api/image-to-pdf')).response.status, 503);
    socket.destroy();
    await new Promise(resolve => setTimeout(resolve, 50));
    await f.uploadsEmpty();
    const { png } = await inputs();
    const result = await f.post('/api/image-to-pdf', {}, [['images', png, 'sample.png', 'image/png']]);
    assert.equal(result.response.status, 200);
});

test('HTTPS reverse-proxy origin uses secure session cookies without trusting forwarded headers', async t => {
    const f = await fixture(t, { publicOrigin: 'https://pdf.example.test' });
    const { png } = await inputs();
    const result = await f.post('/api/image-to-pdf', {}, [['images', png, 'sample.png', 'image/png']], { Origin: 'https://pdf.example.test' });
    assert.equal(result.response.status, 200);
    assert.match(result.response.headers.get('set-cookie'), /; Secure/);
    assert.equal((await f.post('/api/image-to-pdf', {}, [], { Origin: f.url, 'X-Forwarded-Proto': 'https' })).response.status, 403);
    await f.uploadsEmpty();
});

test('preview renders malicious filenames as text and retains the remove control', async () => {
    class Element {
        constructor(tag) { this.tag = tag; this.children = []; this.events = {}; }
        set innerHTML(value) {
            assert.equal(value, '', 'Preview must not interpolate HTML');
            this.children = [];
        }
        append(...items) { this.children.push(...items); }
        appendChild(item) { this.children.push(item); }
        addEventListener(type, callback) { this.events[type] = callback; }
    }
    const preview = new Element('div');
    const button = new Element('button');
    const document = {
        addEventListener() {},
        createElement: tag => new Element(tag),
        getElementById: id => id === 'image-preview' ? preview : button
    };
    const context = vm.createContext({ document, window: {}, FileReader: class {
        readAsDataURL() { this.onload({ target: { result: 'data:image/png;base64,AAAA' } }); }
    } });
    vm.runInContext(await fs.readFile(path.join(__dirname, '../public/js/app.js'), 'utf8'), context);
    const malicious = '\"><img src=x onerror=alert(1)>.png';
    context.testFilename = malicious;
    vm.runInContext('selectedFiles = [{name: testFilename}]; updatePreview();', context);
    const item = preview.children[0];
    assert.deepEqual(item.children.map(child => child.tag), ['span', 'img', 'button', 'span']);
    assert.equal(item.children[1].alt, malicious);
    assert.equal(item.children[3].textContent, malicious);
    item.children[2].events.click();
    assert.equal(preview.children.length, 0);
    assert.equal(button.disabled, true);
    assert.doesNotMatch(await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8'), /\son(?:click|change|input)=/);
});
