let rotateFile = null, rotateAngles = [], rotateTask = null, rotateRequest = null;
let rotateVersion = 0, rotateObserver = null;
const rotateElement = id => document.getElementById('rotate-' + id);
function rotateError(message) {
    rotateElement('error').textContent = message;
    rotateElement('error').classList.toggle('hidden', !message);
}
function clearRotateResult() {
    rotateElement('result').classList.add('hidden');
    rotateElement('download').removeAttribute('href');
}
function updateRotatePages() {
    const changed = rotateAngles.filter(angle => angle !== 0).length;
    Array.from(rotateElement('pages').children).forEach((card, index) => {
        const angle = rotateAngles[index];
        card.querySelector('canvas').className = `rotation-${angle}`;
        card.querySelector('.rotate-angle').textContent = angle ? `${angle}° clockwise from original` : 'Original orientation';
    });
    for (const id of ['left', 'right', 'half', 'restore']) rotateElement(id).disabled = !rotateFile;
    rotateElement('btn').disabled = !rotateFile || !changed;
    rotateElement('status').textContent = rotateFile ? `${changed} of ${rotateAngles.length} pages changed.` : '';
}
function turnPdfPages(index, angle) {
    if (rotateRequest || !rotateFile) return;
    rotateAngles = rotateAngles.map((current, page) => index === null || page === index ? (current + angle + 360) % 360 : current);
    clearRotateResult(); rotateError(''); updateRotatePages();
}
async function chooseRotateFile(files) {
    if (rotateRequest) return;
    resetRotatePdfForm();
    const version = rotateVersion;
    if (files.length !== 1) return rotateError('Choose exactly one PDF.');
    const file = files[0];
    if ((!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') || !file.size || file.size > 50 * 1024 * 1024) return rotateError('Choose a non-empty PDF no larger than 50 MiB.');
    rotateElement('summary').textContent = 'Reading PDF…';
    let task;
    try {
        const bytes = await file.arrayBuffer();
        if (version !== rotateVersion) return;
        task = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false });
        rotateTask = task;
        task.onPassword = () => { task.destroy(); };
        const doc = await task.promise;
        if (version !== rotateVersion) return;
        if (doc.numPages < 1 || doc.numPages > 1000) throw new Error('Page limit');
        rotateFile = file;
        rotateAngles = Array(doc.numPages).fill(0);
        rotateElement('summary').textContent = `${file.name} · ${doc.numPages} page${doc.numPages === 1 ? '' : 's'}`;
        let renderQueue = Promise.resolve();
        rotateObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                rotateObserver?.unobserve(entry.target);
                const card = entry.target;
                renderQueue = renderQueue.then(async () => {
                    if (version !== rotateVersion) return;
                    const canvas = card.querySelector('canvas');
                    try {
                        const page = await doc.getPage(Number(card.dataset.page));
                        if (version !== rotateVersion) return;
                        const original = page.getViewport({ scale: 1 });
                        const viewport = page.getViewport({ scale: 190 / Math.max(original.width, original.height) });
                        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
                        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                        page.cleanup();
                    } catch { canvas.setAttribute('aria-label', 'Preview unavailable; page can still be rotated.'); }
                });
            }
        }, { rootMargin: '250px' });
        for (let index = 0; index < doc.numPages; index++) {
            const page = index + 1;
            const card = document.createElement('li'); card.dataset.page = page;
            const title = document.createElement('p'); title.className = 'reorder-position'; title.textContent = `Page ${page}`;
            const frame = document.createElement('div'); frame.className = 'rotate-preview';
            const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 220;
            canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `Preview of page ${page}`);
            frame.appendChild(canvas);
            const caption = document.createElement('p'); caption.className = 'rotate-angle';
            const controls = document.createElement('div'); controls.className = 'reorder-card-controls';
            for (const [label, angle] of [['Left 90°', 270], ['Right 90°', 90], ['180°', 180]]) {
                const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
                button.setAttribute('aria-label', `Rotate page ${page} ${label.toLowerCase()}`);
                button.addEventListener('click', () => turnPdfPages(index, angle)); controls.appendChild(button);
            }
            card.append(title, frame, caption, controls);
            rotateElement('pages').appendChild(card); rotateObserver.observe(card);
        }
        updateRotatePages();
    } catch {
        if (version === rotateVersion) { resetRotatePdfForm(); rotateError('Use a valid, unencrypted PDF with at most 1,000 pages.'); }
    }
}
function resetRotatePdfForm() {
    rotateVersion++;
    rotateRequest?.abort(); rotateRequest = null;
    rotateObserver?.disconnect(); rotateObserver = null;
    rotateTask?.destroy().catch(() => {}); rotateTask = null;
    rotateFile = null; rotateAngles = [];
    rotateElement('form').reset(); rotateElement('form').removeAttribute('aria-busy');
    rotateElement('controls').disabled = false;
    rotateElement('pages').replaceChildren();
    rotateElement('summary').textContent = 'Choose a PDF to get started.';
    rotateElement('status').textContent = '';
    rotateElement('btn').textContent = 'Save rotated PDF';
    clearRotateResult(); rotateError(''); updateRotatePages();
}
async function submitRotatePdf(event) {
    event.preventDefault();
    if (!rotateFile || rotateRequest || !rotateAngles.some(angle => angle !== 0)) return;
    clearRotateResult(); rotateError('');
    const controller = new AbortController(); rotateRequest = controller;
    rotateElement('controls').disabled = true; rotateElement('form').setAttribute('aria-busy', 'true');
    rotateElement('btn').textContent = 'Saving PDF…';
    const body = new FormData(); body.append('pdf', rotateFile); body.append('rotations', JSON.stringify(rotateAngles));
    body.append('outputFilename', rotateElement('name').value.trim() || 'rotated-document');
    try {
        const response = await fetch('api/rotate', { method: 'POST', body, signal: controller.signal });
        const data = await response.json();
        if (rotateRequest !== controller) return;
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save PDF. Please try again.');
        rotateElement('download').href = data.downloadUrl;
        rotateElement('result-message').textContent = data.message + (data.flattenedForms ? ' Form fields were flattened.' : '');
        rotateElement('result').classList.remove('hidden');
    } catch (error) { if (rotateRequest === controller && error.name !== 'AbortError') rotateError(error.message); }
    finally {
        if (rotateRequest === controller) {
            rotateRequest = null; rotateElement('controls').disabled = false;
            rotateElement('form').removeAttribute('aria-busy'); rotateElement('btn').textContent = 'Save rotated PDF';
        }
    }
}
function initRotatePdf() {
    rotateElement('input').addEventListener('change', event => { chooseRotateFile(Array.from(event.target.files)); event.target.value = ''; });
    const area = rotateElement('upload-area');
    area.addEventListener('dragover', event => { event.preventDefault(); if (!rotateRequest) area.classList.add('dragover'); });
    area.addEventListener('dragleave', () => area.classList.remove('dragover'));
    area.addEventListener('drop', event => { event.preventDefault(); area.classList.remove('dragover'); chooseRotateFile(Array.from(event.dataTransfer.files)); });
    rotateElement('clear').addEventListener('click', resetRotatePdfForm);
    for (const [id, angle] of [['left', 270], ['right', 90], ['half', 180]]) {
        rotateElement(id).addEventListener('click', () => turnPdfPages(null, angle));
    }
    rotateElement('restore').addEventListener('click', () => {
        if (rotateRequest) return;
        rotateAngles.fill(0); clearRotateResult(); rotateError(''); updateRotatePages();
    });
    rotateElement('name').addEventListener('input', clearRotateResult);
    rotateElement('form').addEventListener('submit', submitRotatePdf);
    document.querySelector('[data-tool="rotate"]').addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showTool('rotate'); }
    });
}
