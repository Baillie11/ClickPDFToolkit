const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const mammoth = require('mammoth');
const JSZip = require('jszip');
const context = vm.createContext({ TextDecoder, DataView, Uint8Array, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/word.js'), 'utf8'), context);
const validate = bytes => context.validateDocxArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
test('DOCX validation accepts real Word files and rejects invalid, non-Word and oversized archives', async () => {
    const sample = fs.readFileSync(path.join(__dirname, 'fixtures/word-sample.docx'));
    assert.doesNotThrow(() => validate(sample));
    assert.throws(() => validate(Buffer.from('not a Word file')));
    const emptyWord = await new JSZip().file('hello.txt', 'hello').generateAsync({ type: 'nodebuffer' });
    assert.throws(() => validate(emptyWord), /not a DOCX/);
    const oversized = Buffer.from(sample);
    const offset = oversized.indexOf(Buffer.from('504b0102','hex'));
    oversized.writeUInt32LE(40 * 1024 * 1024, offset + 24);
    assert.throws(() => validate(oversized), /30 MiB/);
    const encrypted = Buffer.from(sample);
    encrypted.writeUInt16LE(1, offset + 8);
    assert.throws(() => validate(encrypted), /unencrypted/);
});
test('Mammoth preserves supported fixture content before PDF layout', async () => {
    const result = await mammoth.convertToHtml({ buffer: fs.readFileSync(path.join(__dirname, 'fixtures/word-sample.docx')) }, { externalFileAccess: false, includeEmbeddedStyleMap: false });
    for (const text of ['Click PDF conversion test', '<strong>Bold sample</strong>', '<em>italic sample</em>', '<ul>', '<table>', 'Quantity', 'data:image/png;base64,', 'Paragraph 30', 'café résumé']) assert.ok(result.value.includes(text), text);
});
