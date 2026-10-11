let mergeFiles = [];
let mergeRequest = null;

function initMergePdf() {
    const input = document.getElementById('merge-input');
    const area = document.getElementById('merge-upload-area');
    input.addEventListener('change', () => {
        addMergeFiles(input.files);
        input.value = '';
    });
    area.addEventListener('dragover', event => {
        event.preventDefault();
        if (!mergeRequest) area.classList.add('dragover');
    });
    area.addEventListener('dragleave', () => area.classList.remove('dragover'));
    area.addEventListener('drop', event => {
        event.preventDefault();
        area.classList.remove('dragover');
        addMergeFiles(event.dataTransfer.files);
    });
    document.getElementById('merge-clear').addEventListener('click', resetMergePdfForm);
    document.getElementById('merge-pdf-form').addEventListener('submit', submitMergePdf);
    document.querySelector('[data-tool="merge"]').addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            showTool('merge');
        }
    });
}

function mergeError(message) {
    const error = document.getElementById('merge-error');
    error.textContent = message;
    error.classList.toggle('hidden', !message);
}

function invalidateMergeResult() {
    document.getElementById('merge-result').classList.add('hidden');
    document.getElementById('merge-download-link').removeAttribute('href');
}

function addMergeFiles(files) {
    if (mergeRequest) return;
    const added = Array.from(files);
    if (added.some(file => !/\.pdf$/i.test(file.name) && file.type !== 'application/pdf')) return mergeError('Please choose PDF files only.');
    if (added.some(file => file.size === 0 || file.size > 50 * 1024 * 1024)) return mergeError('Each PDF must be non-empty and no larger than 50 MiB.');
    const combined = [...mergeFiles, ...added];
    if (combined.length > 50) return mergeError('Choose no more than 50 PDFs.');
    if (combined.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) return mergeError('The combined upload must be no larger than 100 MiB.');
    mergeFiles = combined;
    mergeError('');
    invalidateMergeResult();
    renderMergeFiles();
}

function renderMergeFiles(focusIndex, focusAction) {
    const list = document.getElementById('merge-file-list');
    list.replaceChildren();
    mergeFiles.forEach((file, index) => {
        const item = document.createElement('li');
        const description = document.createElement('span');
        description.className = 'merge-file-description';
        description.textContent = `${index + 1}. ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MiB)`;
        item.appendChild(description);
        for (const [action, label, disabled] of [['up', 'Move up', index === 0], ['down', 'Move down', index === mergeFiles.length - 1], ['remove', 'Remove', false]]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.setAttribute('aria-label', `${label}: ${file.name}`);
            button.disabled = disabled || Boolean(mergeRequest);
            button.addEventListener('click', () => {
                if (mergeRequest) return;
                let next = index;
                if (action === 'remove') {
                    mergeFiles.splice(index, 1);
                    next = Math.min(index, mergeFiles.length - 1);
                } else {
                    next = index + (action === 'up' ? -1 : 1);
                    [mergeFiles[index], mergeFiles[next]] = [mergeFiles[next], mergeFiles[index]];
                }
                mergeError('');
                invalidateMergeResult();
                renderMergeFiles(next, action);
            });
            item.appendChild(button);
            if (index === focusIndex && action === focusAction) queueMicrotask(() => {
                if (button.disabled) item.querySelector('button:not(:disabled)')?.focus();
                else button.focus();
            });
        }
        list.appendChild(item);
    });
    const bytes = mergeFiles.reduce((sum, file) => sum + file.size, 0);
    document.getElementById('merge-summary').textContent = mergeFiles.length ? `${mergeFiles.length} PDFs · ${(bytes / 1024 / 1024).toFixed(2)} MiB. Use Move up / Move down to set the merge order.` : 'Choose at least two PDFs to get started.';
    document.getElementById('merge-btn').disabled = Boolean(mergeRequest) || mergeFiles.length < 2;
    document.getElementById('merge-clear').disabled = Boolean(mergeRequest) || mergeFiles.length === 0;
    if (focusIndex === -1) document.getElementById('merge-input').focus();
}

async function submitMergePdf(event) {
    event.preventDefault();
    if (mergeRequest || mergeFiles.length < 2) return;
    const controller = new AbortController();
    mergeRequest = controller;
    mergeError('');
    invalidateMergeResult();
    document.getElementById('merge-controls').disabled = true;
    document.getElementById('merge-btn').textContent = 'Merging…';
    document.getElementById('merge-pdf-form').setAttribute('aria-busy', 'true');
    const body = new FormData();
    mergeFiles.forEach(file => body.append('pdfs', file));
    body.append('outputFilename', document.getElementById('merge-output-filename').value.trim() || 'merged-document');
    try {
        const response = await fetch('api/merge', { method: 'POST', body, signal: controller.signal });
        const data = await response.json();
        if (mergeRequest !== controller) return;
        if (!response.ok || !data.success) throw new Error(data.error || 'Merge failed. Please try again.');
        document.getElementById('merge-result-message').textContent = data.message + (data.flattenedFormCount ? ` Form fields in ${data.flattenedFormCount} document(s) were flattened.` : '');
        document.getElementById('merge-download-link').href = data.downloadUrl;
        document.getElementById('merge-result').classList.remove('hidden');
    } catch (error) {
        if (error.name !== 'AbortError' && mergeRequest === controller) mergeError(error.message || 'Merge failed. Please try again.');
    } finally {
        if (mergeRequest === controller) {
            mergeRequest = null;
            document.getElementById('merge-controls').disabled = false;
            document.getElementById('merge-btn').textContent = 'Merge PDFs';
            document.getElementById('merge-pdf-form').removeAttribute('aria-busy');
            renderMergeFiles();
        }
    }
}

function resetMergePdfForm() {
    mergeRequest?.abort();
    mergeRequest = null;
    mergeFiles = [];
    document.getElementById('merge-input').value = '';
    document.getElementById('merge-output-filename').value = 'merged-document';
    document.getElementById('merge-controls').disabled = false;
    document.getElementById('merge-btn').textContent = 'Merge PDFs';
    document.getElementById('merge-pdf-form').removeAttribute('aria-busy');
    mergeError('');
    invalidateMergeResult();
    renderMergeFiles();
}
