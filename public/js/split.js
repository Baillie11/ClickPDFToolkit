let splitFile = null;
let splitPageCount = 0;
let splitVersion = 0;
let splitRequest = null;
const splitElement = id => document.getElementById('split-' + id);

function splitError(message) {
    splitElement('error').textContent = message;
    splitElement('error').classList.toggle('hidden', !message);
}
function clearSplitResult() {
    splitElement('result').classList.add('hidden');
    splitElement('downloads').replaceChildren();
}
function updateSplitPlan() {
    clearSplitResult();
    splitElement('pages').disabled = splitElement('mode').value === 'pages';
    splitElement('btn').disabled = true;
    splitElement('plan').textContent = '';
    if (!splitFile || !splitPageCount || splitRequest) return;
    try {
        const groups = ClickPDFSelection.pageGroups(splitElement('mode').value, splitElement('pages').value, splitPageCount);
        splitElement('plan').textContent = `${groups.flat().length} selected pages → ${groups.length} PDF${groups.length === 1 ? '' : 's'}.`;
        splitElement('btn').disabled = false;
        splitError('');
    } catch (error) { splitError(error.message); }
}
async function chooseSplitFile(files) {
    if (splitRequest) return;
    const version = ++splitVersion;
    splitFile = null;
    splitPageCount = 0;
    clearSplitResult();
    updateSplitPlan();
    splitError('');
    splitElement('summary').textContent = 'Choose a PDF to get started.';
    if (files.length !== 1) return splitError('Choose exactly one PDF.');
    const file = files[0];
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return splitError('Choose a PDF file.');
    if (!file.size || file.size > 50 * 1024 * 1024) return splitError('Choose a non-empty PDF no larger than 50 MiB.');
    splitElement('summary').textContent = 'Reading page count…';
    let task;
    try {
        task = pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false });
        task.onPassword = () => task.destroy();
        const doc = await task.promise;
        if (version !== splitVersion) return;
        if (doc.numPages < 1 || doc.numPages > 1000) throw new Error('Too many pages');
        splitFile = file;
        splitPageCount = doc.numPages;
        splitElement('summary').textContent = `${file.name} · ${splitPageCount} pages · ${(file.size / 1024 / 1024).toFixed(2)} MiB`;
        splitElement('pages').value = splitPageCount === 1 ? '1' : `1-${splitPageCount}`;
        updateSplitPlan();
    } catch {
        if (version === splitVersion) {
            splitElement('summary').textContent = 'The PDF could not be read.';
            splitError('Use a valid, unencrypted PDF with at most 1,000 pages.');
        }
    } finally { if (task) await task.destroy().catch(() => {}); }
}
function initSplitPdf() {
    splitElement('input').addEventListener('change', event => { chooseSplitFile(Array.from(event.target.files)); event.target.value = ''; });
    const area = splitElement('upload-area');
    area.addEventListener('dragover', event => { event.preventDefault(); if (!splitRequest) area.classList.add('dragover'); });
    area.addEventListener('dragleave', () => area.classList.remove('dragover'));
    area.addEventListener('drop', event => { event.preventDefault(); area.classList.remove('dragover'); chooseSplitFile(Array.from(event.dataTransfer.files)); });
    splitElement('mode').addEventListener('change', updateSplitPlan);
    splitElement('pages').addEventListener('input', updateSplitPlan);
    splitElement('name').addEventListener('input', clearSplitResult);
    splitElement('clear').addEventListener('click', resetSplitPdfForm);
    splitElement('form').addEventListener('submit', submitSplitPdf);
    document.querySelector('[data-tool="split"]').addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showTool('split'); }
    });
}
async function submitSplitPdf(event) {
    event.preventDefault();
    if (splitRequest || !splitFile) return;
    updateSplitPlan();
    if (splitElement('btn').disabled) return;
    const controller = new AbortController();
    splitRequest = controller;
    splitElement('controls').disabled = true;
    splitElement('form').setAttribute('aria-busy', 'true');
    splitElement('btn').textContent = 'Creating PDFs…';
    const body = new FormData();
    body.append('pdf', splitFile);
    body.append('mode', splitElement('mode').value);
    body.append('pages', splitElement('pages').value);
    body.append('outputFilename', splitElement('name').value.trim() || 'split-document');
    try {
        const response = await fetch('api/split', { method: 'POST', body, signal: controller.signal });
        const data = await response.json();
        if (splitRequest !== controller) return;
        if (!response.ok || !data.success) throw new Error(data.error || 'Split failed. Please try again.');
        for (const [index, file] of data.files.entries()) {
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.href = file.downloadUrl;
            link.download = file.filename;
            link.textContent = `Download part ${index + 1} (${file.pageCount} page${file.pageCount === 1 ? '' : 's'})`;
            item.appendChild(link);
            splitElement('downloads').appendChild(item);
        }
        splitElement('result-message').textContent = data.message + (data.flattenedForms ? ' Form fields were flattened.' : '');
        splitElement('result').classList.remove('hidden');
    } catch (error) {
        if (splitRequest === controller && error.name !== 'AbortError') splitError(error.message || 'Split failed. Please try again.');
    } finally {
        if (splitRequest === controller) {
            splitRequest = null;
            splitElement('controls').disabled = false;
            splitElement('form').removeAttribute('aria-busy');
            splitElement('btn').textContent = 'Create PDFs';
        }
    }
}
function resetSplitPdfForm() {
    splitVersion++;
    splitRequest?.abort();
    splitRequest = null;
    splitFile = null;
    splitPageCount = 0;
    splitElement('form').reset();
    splitElement('controls').disabled = false;
    splitElement('form').removeAttribute('aria-busy');
    splitElement('btn').textContent = 'Create PDFs';
    splitElement('summary').textContent = 'Choose a PDF to get started.';
    splitError('');
    updateSplitPlan();
}
