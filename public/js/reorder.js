let reorderFile = null, reorderOrder = [], reorderTask = null, reorderRequest = null;
let reorderVersion = 0, reorderDragged = null, reorderObserver = null;
const reorderElement = id => document.getElementById('reorder-' + id);
function reorderError(message) {
    reorderElement('error').textContent = message;
    reorderElement('error').classList.toggle('hidden', !message);
}
function clearReorderResult() {
    reorderElement('result').classList.add('hidden');
    reorderElement('download').removeAttribute('href');
}
function updateReorderOrder(focusPage) {
    const list = reorderElement('pages');
    const cards = new Map(Array.from(list.children, card => [Number(card.dataset.page), card]));
    reorderOrder.forEach((page, index) => {
        const card = cards.get(page);
        list.appendChild(card);
        card.querySelector('.reorder-position').textContent = `Position ${index + 1} · Original page ${page}`;
        card.querySelector('[data-move="earlier"]').disabled = index === 0;
        card.querySelector('[data-move="later"]').disabled = index === reorderOrder.length - 1;
        card.querySelector('input').value = index + 1;
    });
    for (const id of ['btn', 'reverse', 'restore']) reorderElement(id).disabled = !reorderFile;
    if (focusPage) cards.get(focusPage)?.querySelector('input').focus();
}
function moveReorderPage(page, destination) {
    if (reorderRequest) return;
    const from = reorderOrder.indexOf(page);
    if (from < 0 || !Number.isInteger(destination) || destination < 0 || destination >= reorderOrder.length) return reorderError(`Choose a position from 1 to ${reorderOrder.length}.`);
    reorderOrder.splice(from, 1);
    reorderOrder.splice(destination, 0, page);
    clearReorderResult();
    reorderError('');
    updateReorderOrder(page);
    reorderElement('status').textContent = `Original page ${page} moved to position ${destination + 1}.`;
}
async function chooseReorderFile(files) {
    if (reorderRequest) return;
    resetReorderPdfForm();
    const version = reorderVersion;
    if (files.length !== 1) return reorderError('Choose exactly one PDF.');
    const file = files[0];
    if ((!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') || !file.size || file.size > 50 * 1024 * 1024) return reorderError('Choose a non-empty PDF no larger than 50 MiB.');
    reorderElement('summary').textContent = 'Reading PDF…';
    let task;
    try {
        const bytes = await file.arrayBuffer();
        if (version !== reorderVersion) return;
        task = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false });
        reorderTask = task;
        task.onPassword = () => { task.destroy(); };
        const doc = await task.promise;
        if (version !== reorderVersion) return;
        if (doc.numPages < 1 || doc.numPages > 1000) throw new Error('Page limit');
        reorderFile = file;
        reorderOrder = Array.from({ length: doc.numPages }, (_, i) => i + 1);
        reorderElement('summary').textContent = `${file.name} · ${doc.numPages} page${doc.numPages === 1 ? '' : 's'}`;
        let renderQueue = Promise.resolve();
        reorderObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                reorderObserver?.unobserve(entry.target);
                const card = entry.target;
                renderQueue = renderQueue.then(async () => {
                    if (version !== reorderVersion) return;
                    const canvas = card.querySelector('canvas');
                    try {
                        const page = await doc.getPage(Number(card.dataset.page));
                        if (version !== reorderVersion) return;
                        const original = page.getViewport({ scale: 1 });
                        const viewport = page.getViewport({ scale: 220 / Math.max(original.width, original.height) });
                        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
                        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                        page.cleanup();
                    } catch { canvas.setAttribute('aria-label', 'Preview unavailable; page can still be reordered.'); }
                });
            }
        }, { rootMargin: '250px' });
        for (const page of reorderOrder) {
            const card = document.createElement('li'); card.dataset.page = page; card.draggable = true;
            const title = document.createElement('p'); title.className = 'reorder-position';
            const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 220;
            canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `Preview of original page ${page}`);
            const controls = document.createElement('div'); controls.className = 'reorder-card-controls';
            for (const [action, label, offset] of [['earlier', 'Earlier', -1], ['later', 'Later', 1]]) {
                const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.move = action;
                button.setAttribute('aria-label', `Move original page ${page} ${label.toLowerCase()}`);
                button.addEventListener('click', () => moveReorderPage(page, reorderOrder.indexOf(page) + offset)); controls.appendChild(button);
            }
            const input = document.createElement('input'); input.type = 'number'; input.min = 1; input.max = doc.numPages;
            input.setAttribute('aria-label', `Destination position for original page ${page}`);
            const move = document.createElement('button'); move.type = 'button'; move.textContent = 'Move';
            move.addEventListener('click', () => moveReorderPage(page, Number(input.value) - 1));
            input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); move.click(); } });
            controls.append(input, move); card.append(title, canvas, controls);
            card.addEventListener('dragstart', event => { if (reorderRequest || event.target.closest('input, button')) return event.preventDefault(); reorderDragged = page; event.dataTransfer.setData('text/plain', String(page)); event.dataTransfer.effectAllowed = 'move'; });
            card.addEventListener('dragover', event => { if (reorderDragged !== null && !reorderRequest) { event.preventDefault(); card.classList.add('reorder-drop'); } });
            card.addEventListener('dragleave', () => card.classList.remove('reorder-drop'));
            card.addEventListener('drop', event => { if (reorderDragged === null) return; event.preventDefault(); event.stopPropagation(); card.classList.remove('reorder-drop'); moveReorderPage(reorderDragged, reorderOrder.indexOf(page)); reorderDragged = null; });
            card.addEventListener('dragend', () => { reorderDragged = null; document.querySelectorAll('.reorder-drop').forEach(item => item.classList.remove('reorder-drop')); });
            reorderElement('pages').appendChild(card); reorderObserver.observe(card);
        }
        updateReorderOrder();
    } catch {
        if (version === reorderVersion) { resetReorderPdfForm(); reorderError('Use a valid, unencrypted PDF with at most 1,000 pages.'); }
    }
}
function resetReorderPdfForm() {
    reorderVersion++;
    reorderRequest?.abort(); reorderRequest = null;
    reorderObserver?.disconnect(); reorderObserver = null;
    reorderTask?.destroy().catch(() => {}); reorderTask = null;
    reorderFile = null; reorderOrder = []; reorderDragged = null;
    reorderElement('form').reset(); reorderElement('form').removeAttribute('aria-busy');
    reorderElement('controls').disabled = false;
    reorderElement('pages').replaceChildren();
    reorderElement('summary').textContent = 'Choose a PDF to get started.';
    reorderElement('status').textContent = '';
    reorderElement('btn').textContent = 'Save reordered PDF';
    clearReorderResult(); reorderError(''); updateReorderOrder();
}
async function submitReorderPdf(event) {
    event.preventDefault();
    if (!reorderFile || reorderRequest) return;
    clearReorderResult(); reorderError('');
    const controller = new AbortController(); reorderRequest = controller;
    reorderElement('controls').disabled = true; reorderElement('form').setAttribute('aria-busy', 'true');
    reorderElement('btn').textContent = 'Saving PDF…';
    const body = new FormData(); body.append('pdf', reorderFile); body.append('order', JSON.stringify(reorderOrder));
    body.append('outputFilename', reorderElement('name').value.trim() || 'reordered-document');
    try {
        const response = await fetch('api/reorder', { method: 'POST', body, signal: controller.signal });
        const data = await response.json();
        if (reorderRequest !== controller) return;
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save PDF. Please try again.');
        reorderElement('download').href = data.downloadUrl;
        reorderElement('result-message').textContent = data.message + (data.flattenedForms ? ' Form fields were flattened.' : '');
        reorderElement('result').classList.remove('hidden');
    } catch (error) { if (reorderRequest === controller && error.name !== 'AbortError') reorderError(error.message); }
    finally {
        if (reorderRequest === controller) {
            reorderRequest = null; reorderElement('controls').disabled = false;
            reorderElement('form').removeAttribute('aria-busy'); reorderElement('btn').textContent = 'Save reordered PDF';
        }
    }
}
function initReorderPdf() {
    reorderElement('input').addEventListener('change', event => { chooseReorderFile(Array.from(event.target.files)); event.target.value = ''; });
    const area = reorderElement('upload-area');
    area.addEventListener('dragover', event => { event.preventDefault(); if (!reorderRequest) area.classList.add('dragover'); });
    area.addEventListener('dragleave', () => area.classList.remove('dragover'));
    area.addEventListener('drop', event => { event.preventDefault(); area.classList.remove('dragover'); chooseReorderFile(Array.from(event.dataTransfer.files)); });
    reorderElement('clear').addEventListener('click', resetReorderPdfForm);
    for (const id of ['reverse', 'restore']) reorderElement(id).addEventListener('click', () => {
        if (reorderRequest) return;
        if (id === 'reverse') reorderOrder.reverse(); else reorderOrder.sort((a, b) => a - b);
        clearReorderResult(); reorderError(''); updateReorderOrder();
        reorderElement('status').textContent = id === 'reverse' ? 'Page order reversed.' : 'Original page order restored.';
    });
    reorderElement('name').addEventListener('input', clearReorderResult);
    reorderElement('form').addEventListener('submit', submitReorderPdf);
    document.querySelector('[data-tool="reorder"]').addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showTool('reorder'); }
    });
}
