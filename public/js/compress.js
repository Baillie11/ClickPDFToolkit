let compressFile = null, compressSource = null, compressRequest = null;
let compressVersion = 0, compressLoading = null, compressDoc = null, compressRender = null, compressPage = 1;
const compressElement = id => document.getElementById('compress-' + id);
const compressSize = bytes => bytes < 1000000 ? `${(bytes / 1000).toFixed(1)} KB` : `${(bytes / 1000000).toFixed(2)} MB`;
function compressError(message) {
    compressElement('error').textContent = message;
    compressElement('error').classList.toggle('hidden', !message);
}
function clearCompressResult() {
    compressVersion++;
    compressRender?.cancel(); compressRender = null;
    compressLoading?.destroy(); compressLoading = null; compressDoc = null;
    compressElement('result').classList.add('hidden');
    compressElement('download').removeAttribute('href');
    compressElement('prev').disabled = compressElement('next').disabled = true;
    const canvas = compressElement('canvas'); canvas.width = canvas.height = 0;
}
function resetCompressPdfForm() {
    compressRequest?.abort(); compressRequest = null;
    compressFile = compressSource = null;
    clearCompressResult(); compressError('');
    compressElement('form').reset();
    compressElement('controls').disabled = false;
    compressElement('form').removeAttribute('aria-busy');
    compressElement('btn').disabled = true;
    compressElement('btn').textContent = 'Compress PDF';
    compressElement('summary').textContent = 'Choose a PDF to get started.';
    compressElement('status').textContent = '';
    updateCompressTarget();
}
function updateCompressTarget() {
    const custom = compressElement('target').value === 'custom';
    compressElement('custom-group').classList.toggle('hidden', !custom);
    compressElement('custom').disabled = !custom;
}
function chooseCompressFile(files) {
    if (compressRequest) return;
    resetCompressPdfForm();
    const file = files[0];
    if (files.length !== 1 || (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') || !file.size || file.size > 50 * 1024 * 1024) {
        return compressError('Choose one non-empty PDF no larger than 50 MiB.');
    }
    compressFile = file;
    compressElement('summary').textContent = `${file.name} · ${compressSize(file.size)}`;
    compressElement('name').value = (file.name.replace(/\.pdf$/i, '') + '-compressed').slice(0, 100);
    compressElement('btn').disabled = false;
}
async function renderCompressPage() {
    const doc = compressDoc, version = compressVersion;
    if (!doc || compressRender) return;
    compressElement('prev').disabled = compressElement('next').disabled = true;
    try {
        const page = await doc.getPage(compressPage);
        if (version !== compressVersion) return;
        const initial = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(1.5, 1100 / Math.max(initial.width, initial.height)) });
        const canvas = compressElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        compressRender = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        await compressRender.promise;
        if (version !== compressVersion) return;
        compressElement('page-label').textContent = `Page ${compressPage} of ${doc.numPages}`;
        compressElement('preview-status').textContent = 'Preview of your output. Existing selectable text is preserved; scans are not converted to text.';
    } catch (error) {
        if (version === compressVersion && error.name !== 'RenderingCancelledException') compressElement('preview-status').textContent = 'Preview unavailable. Download the PDF to review it.';
    } finally {
        if (version === compressVersion) {
            compressRender = null;
            compressElement('prev').disabled = compressPage <= 1;
            compressElement('next').disabled = compressPage >= doc.numPages;
        }
    }
}
async function previewCompressedPdf(url, version) {
    compressElement('preview-status').textContent = 'Loading preview…';
    compressElement('page-label').textContent = '';
    try {
        compressLoading = pdfjsLib.getDocument({ url, isEvalSupported: false });
        const doc = await compressLoading.promise;
        if (version !== compressVersion) { await doc.destroy(); return; }
        compressDoc = doc; compressPage = 1;
        await renderCompressPage();
    } catch {
        if (version === compressVersion) compressElement('preview-status').textContent = 'Preview unavailable. Download the PDF to review it.';
    }
}
async function submitCompressPdf(event) {
    event.preventDefault();
    if (compressRequest || (!compressFile && !compressSource)) return;
    clearCompressResult(); compressError('');
    const version = compressVersion, controller = new AbortController();
    compressRequest = controller;
    compressElement('controls').disabled = true;
    compressElement('form').setAttribute('aria-busy', 'true');
    compressElement('btn').textContent = 'Compressing…';
    compressElement('status').textContent = 'Optimising your PDF. This can take up to 45 seconds.';
    const body = new FormData();
    if (compressSource) body.append('sourceFilename', compressSource);
    else body.append('pdf', compressFile);
    body.append('preset', compressElement('preset').value);
    const target = compressElement('target').value;
    if (target) body.append('targetMB', target === 'custom' ? compressElement('custom').value : target);
    body.append('outputFilename', compressElement('name').value.trim() || 'compressed-document');
    try {
        const response = await fetch('api/compress', { method: 'POST', body, signal: controller.signal });
        const data = await response.json();
        if (compressRequest !== controller) return;
        if (!response.ok || !data.success) throw new Error(data.error || 'Compression failed. Please try again.');
        compressElement('result-title').textContent = data.unchanged ? 'No smaller version found' : 'Your smaller PDF is ready';
        compressElement('result-message').textContent = data.message;
        compressElement('before').textContent = compressSize(data.originalBytes);
        compressElement('after').textContent = compressSize(data.outputBytes);
        compressElement('saved').textContent = `${data.savedPercent}% (${compressSize(data.savedBytes)})`;
        compressElement('target-result').textContent = data.targetMet === null ? '' : data.targetMet
            ? `Target met: your PDF fits within ${compressSize(data.targetBytes)}.`
            : `Target not reached: the smallest result found is ${compressSize(data.outputBytes)}. Try removing unneeded pages with Split / Extract PDF.`;
        compressElement('download').href = data.downloadUrl;
        compressElement('download').textContent = data.unchanged ? 'Download original PDF' : 'Download compressed PDF';
        compressElement('result').classList.remove('hidden');
        compressElement('status').textContent = 'Done. Check your result below.';
        void previewCompressedPdf(data.downloadUrl, version);
    } catch (error) {
        if (compressRequest === controller && error.name !== 'AbortError') {
            compressError(error.message || 'Compression failed. Please try again.');
            compressElement('status').textContent = '';
        }
    } finally {
        if (compressRequest === controller) {
            compressRequest = null;
            compressElement('controls').disabled = false;
            compressElement('form').removeAttribute('aria-busy');
            compressElement('btn').textContent = 'Compress PDF';
        }
    }
}
function initCompressPdf() {
    const input = compressElement('input'), area = compressElement('upload-area');
    input.addEventListener('change', () => { const files = [...input.files]; chooseCompressFile(files); input.value = ''; });
    area.addEventListener('dragover', event => { event.preventDefault(); if (!compressRequest) area.classList.add('dragover'); });
    area.addEventListener('dragleave', () => area.classList.remove('dragover'));
    area.addEventListener('drop', event => { event.preventDefault(); area.classList.remove('dragover'); chooseCompressFile([...event.dataTransfer.files]); });
    compressElement('clear').addEventListener('click', resetCompressPdfForm);
    compressElement('form').addEventListener('submit', submitCompressPdf);
    compressElement('target').addEventListener('change', updateCompressTarget);
    for (const id of ['preset', 'target', 'custom', 'name']) compressElement(id).addEventListener('change', () => { clearCompressResult(); compressElement('status').textContent = ''; });
    compressElement('prev').addEventListener('click', () => { if (compressDoc && !compressRender && compressPage > 1) { compressPage--; void renderCompressPage(); } });
    compressElement('next').addEventListener('click', () => { if (compressDoc && !compressRender && compressPage < compressDoc.numPages) { compressPage++; void renderCompressPage(); } });
    document.querySelector('[data-tool="compress"]').addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showTool('compress'); }
    });
    // Reuse session-owned server output directly; no download/re-upload round trip.
    for (const id of ['merge-download-link', 'edit-download-link', 'download-link', 'sign-download-link', 'rotate-download', 'reorder-download']) {
        const link = document.getElementById(id);
        if (!link) continue;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'compress-next-tool hidden'; button.textContent = 'Compress this PDF';
        link.after(button);
        const sync = () => button.classList.toggle('hidden', !link.getAttribute('href')?.includes('/download/'));
        new MutationObserver(sync).observe(link, { attributes: true, attributeFilter: ['href'] }); sync();
        button.addEventListener('click', () => {
            const url = new URL(link.href, location.href);
            if (url.origin !== location.origin || !url.pathname.includes('/download/')) return;
            resetCompressPdfForm();
            compressSource = decodeURIComponent(url.pathname.split('/').pop());
            compressElement('summary').textContent = 'Your completed PDF is ready to compress. No upload needed.';
            compressElement('btn').disabled = false;
            showTool('compress'); compressElement('preset').focus();
        });
    }
}
