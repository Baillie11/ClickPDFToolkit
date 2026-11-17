const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

test('compression interface submits targets, safely displays filenames, chains output and discards stale responses', async () => {
    class Element {
        constructor() {
            this.events = {}; this.attributes = {}; this.value = ''; this.textContent = ''; this.hiddenClasses = new Set();
            this.classList = { add: key => this.hiddenClasses.add(key), remove: key => this.hiddenClasses.delete(key), toggle: (key, yes) => yes ? this.hiddenClasses.add(key) : this.hiddenClasses.delete(key) };
        }
        addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
        setAttribute(key, value) { this.attributes[key] = value; }
        removeAttribute(key) { delete this.attributes[key]; if (key === 'href') this.href = ''; }
        getAttribute(key) { return key === 'href' ? this.href : this.attributes[key]; }
        reset() {}
        after(button) { this.nextButton = button; }
        focus() {}
        getContext() { return {}; }
    }
    const elements = new Map();
    const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement: () => new Element(), querySelector: () => new Element() };
    const get = id => document.getElementById('compress-' + id);
    let submitted, pending, tool;
    const result = { success: true, unchanged: false, message: 'Compressed.', originalBytes: 3000000, outputBytes: 200000, savedBytes: 2800000, savedPercent: 93.3, targetBytes: 100000, targetMet: false, downloadUrl: '/clickpdf/download/result.pdf' };
    const context = vm.createContext({ document, AbortController, URL, location: { href: 'https://pdf.example/clickpdf/', origin: 'https://pdf.example' },
        MutationObserver: class { observe() {} }, showTool(value) { tool = value; },
        FormData: class { constructor() { this.entries = []; } append(...entry) { this.entries.push(entry); } },
        fetch: async (url, options) => { submitted = options.body.entries; if (pending) await pending; return { ok: true, json: async () => result }; },
        pdfjsLib: { getDocument() { return { promise: Promise.reject(new Error('Preview unavailable')), destroy() {} }; } }
    });
    vm.runInContext(await fs.readFile(path.join(__dirname, '../public/js/compress.js'), 'utf8'), context);
    vm.runInContext('initCompressPdf(); chooseCompressFile([{name:"<img onerror=alert(1)>.pdf",size:3000000,type:"application/pdf"}]);', context);
    assert.match(get('summary').textContent, /<img onerror/);
    assert.equal(get('btn').disabled, false);
    get('preset').value = 'quality'; get('target').value = 'custom'; get('custom').value = '0.1';
    vm.runInContext('updateCompressTarget()', context);
    assert.equal(get('custom').disabled, false);
    await vm.runInContext('submitCompressPdf({preventDefault(){}})', context);
    assert.equal(submitted.find(([key]) => key === 'targetMB')[1], '0.1');
    assert.equal(submitted.find(([key]) => key === 'preset')[1], 'quality');
    assert.match(get('target-result').textContent, /Target not reached/);
    assert.equal(get('download').href, result.downloadUrl);
    assert.equal(get('controls').disabled, false);
    const sourceLink = document.getElementById('merge-download-link');
    sourceLink.href = 'https://pdf.example/clickpdf/download/merged.pdf';
    sourceLink.nextButton.events.click[0]();
    assert.equal(tool, 'compress');
    await vm.runInContext('submitCompressPdf({preventDefault(){}})', context);
    assert.equal(submitted.find(([key]) => key === 'sourceFilename')[1], 'merged.pdf');
    assert.equal(submitted.some(([key]) => key === 'pdf'), false);
    let release; pending = new Promise(resolve => { release = resolve; });
    const request = vm.runInContext('submitCompressPdf({preventDefault(){}})', context);
    vm.runInContext('resetCompressPdfForm()', context);
    release(); await request;
    assert.equal(get('download').href, '');
    assert.equal(get('result').hiddenClasses.has('hidden'), true);
    assert.equal(get('btn').disabled, true);
    vm.runInContext('chooseCompressFile([{name:"large.pdf",size:60000000,type:"application/pdf"}])', context);
    assert.match(get('error').textContent, /50 MiB/);
    assert.equal(get('btn').disabled, true);
});

test('compression workspace contains every required control and uses CSP-compatible markup', async () => {
    const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
    const script = await fs.readFile(path.join(__dirname, '../public/js/compress.js'), 'utf8');
    for (const [, id] of script.matchAll(/compressElement\('([^']+)'\)/g)) assert.ok(html.includes(`id="compress-${id}"`), id);
    assert.match(html, /class="tool-card active" data-tool="compress" role="button" tabindex="0"/);
    assert.doesNotMatch(html, /\son(?:click|change|input)=/);
});
