let wordFile = null, wordVersion = 0, wordBusy = false, wordUrl = null, wordLibraries = null, wordWorker = null, wordCancel = null;
const wordElement = id => document.getElementById('word-' + id);
function wordError(message) {
    wordElement('error').textContent = message;
    wordElement('error').classList.toggle('hidden', !message);
}
function clearWordResult() {
    if (wordUrl) URL.revokeObjectURL(wordUrl);
    wordUrl = null;
    wordElement('result').classList.add('hidden');
    wordElement('download').removeAttribute('href');
}
function resetWordPdfForm() {
    wordCancel?.(); wordCancel = null;
    wordVersion++; wordFile = null; wordBusy = false;
    wordElement('form').reset();
    wordElement('controls').disabled = false;
    wordElement('btn').disabled = true;
    wordElement('btn').textContent = 'Convert to PDF';
    wordElement('summary').textContent = 'Choose a DOCX to get started.';
    clearWordResult(); wordError('');
}
function chooseWordFile(files) {
    if (wordBusy) return;
    resetWordPdfForm();
    if (files.length !== 1 || !/\.docx$/i.test(files[0].name) || !files[0].size || files[0].size > 10 * 1024 * 1024) return wordError('Choose one non-empty DOCX file no larger than 10 MiB. Older .doc files are not supported.');
    wordFile = files[0];
    wordElement('summary').textContent = wordFile.name;
    wordElement('name').value = wordFile.name.replace(/\.docx$/i, '').slice(0, 100);
    wordElement('btn').disabled = false;
}
function loadWordLibraries() {
    if (!wordLibraries) wordLibraries = (async () => {
        for (const name of ['purify.min.js', 'html-to-pdfmake.js']) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'vendor/word/' + name;
                script.onload = resolve;
                script.onerror = () => { script.remove(); reject(new Error('Could not load the converter. Refresh and try again.')); };
                document.head.appendChild(script);
            });
        }
    })().catch(error => { wordLibraries = null; throw error; });
    return wordLibraries;
}
// Bound ZIP expansion before Mammoth reads a DOCX. No archive contents are executed.
function validateDocxArchive(buffer) {
    const view = new DataView(buffer);
    let end = -1;
    for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
        if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === view.byteLength) { end = i; break; }
    }
    if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('Use a valid, unencrypted DOCX file.');
    const count = view.getUint16(end + 10, true);
    if (!count || count > 2000 || view.getUint16(end + 8, true) !== count) throw new Error('This document is too complex to convert in your browser.');
    let offset = view.getUint32(end + 16, true), expanded = 0;
    const names = new Set();
    for (let i = 0; i < count; i++) {
        if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50 || (view.getUint16(offset + 8, true) & 1)) throw new Error('Use a valid, unencrypted DOCX file.');
        expanded += view.getUint32(offset + 24, true);
        const size = view.getUint16(offset + 28, true);
        const next = offset + 46 + size + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
        if (next > end || expanded > 30 * 1024 * 1024) throw new Error('The expanded document exceeds the 30 MiB browser limit.');
        names.add(new TextDecoder().decode(new Uint8Array(buffer, offset + 46, size)));
        offset = next;
    }
    if (!names.has('word/document.xml') || !names.has('[Content_Types].xml')) throw new Error('This file is not a DOCX document.');
}
function runWordWorker(data) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('js/word-worker.js');
        wordWorker = worker;
        const finish = (error, result) => {
            clearTimeout(timer); worker.terminate();
            if (wordWorker === worker) { wordWorker = null; wordCancel = null; }
            if (error) reject(new Error(error)); else resolve(result);
        };
        const timer = setTimeout(() => finish('Conversion timed out. Try a smaller or simpler DOCX.'), 45000);
        wordCancel = () => finish('Conversion cancelled.');
        worker.onerror = () => finish('Could not run the converter. Refresh and try a simpler DOCX.');
        worker.onmessage = event => finish(event.data.error, event.data);
        worker.postMessage(data);
    });
}
function wordPdfContent(html) {
    if (html.length > 8 * 1024 * 1024) throw new Error('The document content is too large for browser conversion.');
    // Strip hyperlinks, styles, scripts and all remote resources before parsing for PDF.
    const clean = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
        ALLOWED_ATTR: ['src', 'colspan', 'rowspan'], ALLOW_DATA_ATTR: false
    });
    const fragment = new DOMParser().parseFromString(clean, 'text/html');
    fragment.querySelectorAll('img').forEach(image => {
        if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(image.getAttribute('src') || '')) image.remove();
    });
    const content = htmlToPdfmake(fragment.body.innerHTML, { window, defaultStyles: { p: { margin: [0, 0, 0, 8] } } });
    function fit(node) {
        if (Array.isArray(node)) return node.forEach(fit);
        if (!node || typeof node !== 'object') return;
        if (node.image) { node.fit = [480, 650]; delete node.width; delete node.height; }
        if (node.table) node.table.widths = Array(node.table.body[0].length).fill('*');
        Object.values(node).forEach(fit);
    }
    fit(content);
    return content;
}
function initWordPdf() {
    document.querySelector('[data-tool="word-to-pdf"]').addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showTool('word-to-pdf'); }
    });
    wordElement('input').addEventListener('change', event => chooseWordFile(Array.from(event.target.files)));
    wordElement('clear').addEventListener('click', resetWordPdfForm);
    wordElement('name').addEventListener('input', clearWordResult);
    wordElement('size').addEventListener('change', clearWordResult);
    const area = wordElement('upload-area');
    area.addEventListener('dragover', event => event.preventDefault());
    area.addEventListener('drop', event => { event.preventDefault(); chooseWordFile(Array.from(event.dataTransfer.files)); });
    wordElement('form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!wordFile || wordBusy) return;
        const version = wordVersion, file = wordFile;
        wordBusy = true; clearWordResult(); wordError('');
        wordElement('controls').disabled = true;
        wordElement('btn').textContent = 'Converting...';
        try {
            const buffer = await file.arrayBuffer();
            validateDocxArchive(buffer);
            await loadWordLibraries();
            if (version !== wordVersion) return;
            const result = await runWordWorker({ kind: 'docx', buffer });
            if (version !== wordVersion) return;
            const content = wordPdfContent(result.html);
            if (!content.length) throw new Error('No supported text or images were found in this document.');
            const { blob } = await runWordWorker({ kind: 'pdf', definition: { content, pageSize: wordElement('size').value, pageMargins: [40, 40, 40, 40], defaultStyle: { fontSize: 11 }, info: { title: file.name.replace(/\.docx$/i, ''), creator: 'Click PDF' } } });
            if (version !== wordVersion) return;
            if (blob.size > 50 * 1024 * 1024) throw new Error('The PDF exceeds the 50 MiB browser limit.');
            wordUrl = URL.createObjectURL(blob);
            wordElement('download').href = wordUrl;
            wordElement('download').download = (wordElement('name').value.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'converted-document') + '.pdf';
            wordElement('result-message').textContent = 'Converted with simplified formatting. Review every page before sharing.' + (result.warnings ? ' Some document features may have been omitted.' : '');
            wordElement('result').classList.remove('hidden');
        } catch (error) {
            if (version === wordVersion) wordError(error.message || 'Could not convert this document. Try a simpler DOCX file.');
        } finally {
            if (version === wordVersion) {
                wordBusy = false; wordElement('controls').disabled = false;
                wordElement('btn').textContent = 'Convert to PDF'; wordElement('btn').disabled = !wordFile;
            }
        }
    });
}
