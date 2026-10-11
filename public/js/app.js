// Click PDF Toolkit - Frontend JavaScript

document.addEventListener('DOMContentLoaded', () => {
    configurePdfJs();
    const actions = {
        showToolGrid, removeEditPdf, removeSignPdf, clearSignature,
        removeP2iPdf, convertPdfToImage,
        editGoToPage, editUndo, editRedo, setEditMode, switchEditSigTab, clearEditSignature, confirmEditSignature,
        deleteAnnotation, deleteSignature, deleteRect, deleteDrawStroke
    };
    // One delegated listener (no inline handlers: the CSP forbids them), so buttons created later also work.
    document.addEventListener('click', (event) => {
        const control = event.target.closest && event.target.closest('[data-action]');
        const action = control && actions[control.dataset.action];
        if (!action) return;
        const arg = control.dataset.arg;
        if (arg === undefined) action();
        else action(/^-?\d+$/.test(arg) ? Number(arg) : arg);
    });
    initToolCards();
    initMergePdf();
    initImageToPdf();
    initEditPdf();
    initSignPdf();
    initPdfToImage();
    initRangeSliders();
});

// pdf.js is vendored under vendor/pdfjs because the CSP only allows same-origin scripts and workers.
function configurePdfJs() {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
    }
}

// The server limits each multipart text field to 1 MiB.
const MAX_EDIT_FIELD_BYTES = 1000000;

// Thin out freehand points so strokes stay small when sent as JSON.
function simplifyStroke(points) {
    const result = [];
    let last = null;
    points.forEach((point, index) => {
        const x = Math.round(point.xPct * 100) / 100;
        const y = Math.round(point.yPct * 100) / 100;
        const isLast = index === points.length - 1;
        if (last && !isLast && (x - last[0]) ** 2 + (y - last[1]) ** 2 < 0.04) return;
        last = [x, y];
        result.push(last);
    });
    return result;
}

function loadImageElement(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Unable to read image'));
        image.src = source;
    });
}

// Downscale/re-encode images placed in the editor so they fit the server's field limit.
async function shrinkImageDataUrl(dataUrl, maxSide = 1400, maxLength = 600000) {
    const image = await loadImageElement(dataUrl);
    const width = image.naturalWidth || 300;
    const height = image.naturalHeight || 150;
    const keepAlpha = dataUrl.startsWith('data:image/png');
    let scale = Math.min(1, maxSide / Math.max(width, height));
    let output = dataUrl;
    for (let attempt = 0; attempt < 6; attempt++) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        if (!keepAlpha) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        output = keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
        if (output.length <= maxLength) break;
        scale *= 0.7;
    }
    return output;
}

// Tool card click handlers
function initToolCards() {
    const toolCards = document.querySelectorAll('.tool-card');
    
    toolCards.forEach(card => {
        card.addEventListener('click', () => {
            const tool = card.dataset.tool;
            showTool(tool);
        });
    });
}

// Show specific tool workspace
function showTool(tool) {
    const toolGrid = document.getElementById('tool-grid');
    const workspace = document.getElementById('workspace');
    const imageToPdfTool = document.getElementById('image-to-pdf-tool');
    const editTool = document.getElementById('edit-tool');
    const signTool = document.getElementById('sign-tool');
    const pdfToImageTool = document.getElementById('pdf-to-image-tool');
    const comingSoonTool = document.getElementById('coming-soon-tool');
    const mergeTool = document.getElementById('merge-tool');
    
    // Hide all tools first
    imageToPdfTool.classList.add('hidden');
    editTool.classList.add('hidden');
    signTool.classList.add('hidden');
    pdfToImageTool.classList.add('hidden');
    comingSoonTool.classList.add('hidden');
    mergeTool.classList.add('hidden');
    
    // Hide tool grid, show workspace
    toolGrid.classList.add('hidden');
    workspace.classList.remove('hidden');
    
    // Show appropriate tool
    if (tool === 'merge') {
        mergeTool.classList.remove('hidden');
    } else if (tool === 'image-to-pdf') {
        imageToPdfTool.classList.remove('hidden');
    } else if (tool === 'edit') {
        editTool.classList.remove('hidden');
    } else if (tool === 'sign') {
        signTool.classList.remove('hidden');
        initSignatureCanvas();
    } else if (tool === 'pdf-to-image') {
        pdfToImageTool.classList.remove('hidden');
    } else {
        comingSoonTool.classList.remove('hidden');
        
        // Update coming soon title
        const titles = {
            'merge': '🔗 Merge PDFs',
            'split': '✂️ Split PDF',
            'reorder': '🔄 Reorder Pages',
            'rotate': '↻ Rotate PDF',
            'word-to-pdf': '📝 Word to PDF',
            'ppt-to-pdf': '📊 PowerPoint to PDF',
            'excel-to-pdf': '📈 Excel to PDF',
            'html-to-pdf': '🌐 HTML to PDF',
            'pdf-to-word': '📝 PDF to Word',
            'pdf-to-ppt': '📊 PDF to PowerPoint',
            'pdf-to-excel': '📈 PDF to Excel',
            'compress': '📦 Compress PDF',
            'watermark': '💧 Watermark',
            'protect': '🔒 Protect PDF',
            'unlock': '🔓 Unlock PDF',
            'ocr': '👁️ OCR PDF',
            'extract-text': '📋 Extract Text'
        };
        
        document.getElementById('coming-soon-title').textContent = titles[tool] || tool;
    }
}

// Show tool grid (back button)
function showToolGrid() {
    const toolGrid = document.getElementById('tool-grid');
    const workspace = document.getElementById('workspace');
    
    toolGrid.classList.remove('hidden');
    workspace.classList.add('hidden');
    
    // Reset all forms
    resetImageToPdfForm();
    resetEditPdfForm();
    resetSignPdfForm();
    resetMergePdfForm();
    resetPdfToImageForm();
}

// Initialize range sliders to show values
function initRangeSliders() {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        const valueSpan = document.getElementById(slider.id + '-value');
        if (valueSpan) {
            slider.addEventListener('input', () => {
                valueSpan.textContent = slider.value + '%';
            });
        }
    });
}

// Image to PDF functionality
let selectedFiles = [];

function initImageToPdf() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('image-input');
    const form = document.getElementById('image-to-pdf-form');
    
    // Click to browse
    uploadArea.addEventListener('click', () => fileInput.click());
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    
    // Form submit
    form.addEventListener('submit', handleImageToPdfSubmit);
}

function handleFiles(files) {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
    
    Array.from(files).forEach(file => {
        if (validTypes.includes(file.type)) {
            selectedFiles.push(file);
        }
    });
    
    updatePreview();
    updateConvertButton();
}

function updatePreview() {
    const previewContainer = document.getElementById('image-preview');
    previewContainer.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const item = document.createElement('div');
            item.className = 'preview-item';
            const badge = document.createElement('span');
            badge.className = 'order-badge';
            badge.textContent = String(index + 1);
            const image = document.createElement('img');
            image.src = e.target.result;
            image.alt = file.name;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'remove-btn';
            remove.textContent = '×';
            remove.addEventListener('click', () => removeFile(index));
            const label = document.createElement('span');
            label.className = 'file-name';
            label.textContent = file.name;
            item.append(badge, image, remove, label);
            previewContainer.appendChild(item);
        };
        
        reader.readAsDataURL(file);
    });
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updatePreview();
    updateConvertButton();
}

function updateConvertButton() {
    const btn = document.getElementById('convert-btn');
    btn.disabled = selectedFiles.length === 0;
}

async function handleImageToPdfSubmit(e) {
    e.preventDefault();
    
    if (selectedFiles.length === 0) return;
    
    const btn = document.getElementById('convert-btn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');
    const result = document.getElementById('result');
    
    // Show loading state
    btn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
    result.classList.add('hidden');
    
    // Remove any existing error message
    const existingError = document.querySelector('#image-to-pdf-form .error-message');
    if (existingError) existingError.remove();
    
    try {
        const formData = new FormData();
        
        // Add files
        selectedFiles.forEach(file => {
            formData.append('images', file);
        });
        
        // Add options
        formData.append('pageSize', document.getElementById('page-size').value);
        formData.append('orientation', document.getElementById('orientation').value);
        formData.append('margin', document.getElementById('margin').value);
        formData.append('fitMode', document.getElementById('fit-mode').value);
        formData.append('outputFilename', document.getElementById('output-filename').value || 'my-document');
        
        const response = await fetch('api/image-to-pdf', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Show success
            document.getElementById('result-message').textContent = data.message;
            document.getElementById('download-link').href = data.downloadUrl;
            result.classList.remove('hidden');
        } else {
            showError(data.error || 'Conversion failed');
        }
    } catch (error) {
        showError('An error occurred: ' + error.message);
    } finally {
        // Reset button
        btn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
    }
}

function showError(message) {
    const form = document.getElementById('image-to-pdf-form');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    form.appendChild(errorDiv);
}

function resetImageToPdfForm() {
    selectedFiles = [];
    document.getElementById('image-preview').innerHTML = '';
    document.getElementById('result').classList.add('hidden');
    document.getElementById('image-input').value = '';
    document.getElementById('output-filename').value = 'my-document';
    updateConvertButton();
    
    const existingError = document.querySelector('#image-to-pdf-form .error-message');
    if (existingError) existingError.remove();
}

// ==================== EDIT PDF ====================
let editPdfFile = null;
let editPdfDoc = null;       // pdf.js document
let editCurrentPage = 1;
let editTotalPages = 0;
let editAnnotations = [];    // {id, text, x%, y%, page, fontSize, color}
let editNextAnnotId = 1;
let editMode = 'text';       // current tool mode
let editCanvasScale = 1;     // scale used for rendering
let editSigCanvas = null;    // signature drawing canvas
let editSigCtx = null;       // signature canvas context
let editSigDrawing = false;  // currently drawing signature?
let editSigHasDrawn = false; // has drawn anything?
let editSigImageData = null; // confirmed signature as data URL
let editSignatures = [];     // {id, imageData, x%, y%, page, widthPct, heightPct, naturalW, naturalH}
let editNextSigId = 1;
let editRects = [];          // {id, type:'highlight'|'whiteout', x%, y%, w%, h%, page, color, opacity}
let editNextRectId = 1;
let editDrawStrokes = [];    // {page, points:[], color, size} per-page freehand strokes
let editImageData = null;    // staged image data URL for image tool
let editUndoStack = [];      // undo history
let editRedoStack = [];      // redo history
let editCanvasDragging = false;  // for draw/highlight/whiteout drag
let editDragStart = null;        // {xPct, yPct}
let editDragCurrent = null;      // {xPct, yPct}
let editDrawPoints = [];         // current freehand stroke points
let editJustDragged = false;     // suppress click after drag
let editTextItems = {};          // { pageNum: [lineItems] } - extracted text per page
let editTextExtracted = {};      // { pageNum: true } - tracks which pages have been extracted
const EDIT_MODES = ['text','signature','image','draw','highlight','whiteout','check','cross','edittext'];

function initEditPdf() {
    const uploadArea = document.getElementById('edit-upload-area');
    const fileInput = document.getElementById('edit-pdf-input');
    const form = document.getElementById('edit-pdf-form');

    // Click to browse
    uploadArea.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            editPdfFile = e.target.files[0];
            loadEditPdf();
        }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            editPdfFile = files[0];
            loadEditPdf();
        }
    });

    // Click on canvas container to add annotations
    const canvasContainer = document.getElementById('edit-canvas-container');
    canvasContainer.addEventListener('click', handleCanvasClick);

    // Mouse/touch handlers for draw, highlight, whiteout
    canvasContainer.addEventListener('mousedown', handleCanvasMouseDown);
    document.addEventListener('mousemove', handleCanvasMouseMove);
    document.addEventListener('mouseup', handleCanvasMouseUp);
    canvasContainer.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        handleCanvasMouseDown({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => e.preventDefault() });
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
        if (!editCanvasDragging) return;
        const t = e.touches[0];
        handleCanvasMouseMove({ clientX: t.clientX, clientY: t.clientY });
        e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', () => handleCanvasMouseUp());

    // Image file input
    document.getElementById('edit-image-input').addEventListener('change', handleEditImageUpload);

    // Form submit
    form.addEventListener('submit', handleEditPdfSubmit);
}

// Load PDF into the viewer using pdf.js
async function loadEditPdf() {
    if (!editPdfFile) return;

    const arrayBuffer = await editPdfFile.arrayBuffer();
    editPdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    editTotalPages = editPdfDoc.numPages;
    editCurrentPage = 1;
    editAnnotations = [];
    editNextAnnotId = 1;
    editTextItems = {};
    editTextExtracted = {};

    // Show editor, hide upload area
    document.getElementById('edit-upload-area').classList.add('hidden');
    document.getElementById('edit-editor').classList.remove('hidden');
    document.getElementById('edit-pdf-name').textContent = editPdfFile.name;
    document.getElementById('edit-btn').disabled = false;

    // Pre-fill filename field with the original PDF name (without .pdf extension)
    const baseName = editPdfFile.name.replace(/\.pdf$/i, '');
    document.getElementById('edit-output-filename').value = baseName;

    updatePageNav();
    renderEditPage();
    updateAnnotationsList();
}

// Render the current page onto the canvas
async function renderEditPage() {
    if (!editPdfDoc) return;

    const page = await editPdfDoc.getPage(editCurrentPage);
    const container = document.getElementById('edit-canvas-container');
    const canvas = document.getElementById('edit-pdf-canvas');
    const ctx = canvas.getContext('2d');

    // Scale to fit container width
    const containerWidth = container.clientWidth;
    const viewport = page.getViewport({ scale: 1 });
    editCanvasScale = containerWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale: editCanvasScale });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    // Set container height to match canvas
    container.style.height = scaledViewport.height + 'px';

    await page.render({
        canvasContext: ctx,
        viewport: scaledViewport
    }).promise;

    // Extract text if in edittext mode
    if (editMode === 'edittext' && !editTextExtracted[editCurrentPage]) {
        await extractPageText(editCurrentPage);
        editTextExtracted[editCurrentPage] = true;
    }

    // Re-render annotation overlays for this page
    renderAnnotationOverlays();
}

// Page navigation
function editGoToPage(delta) {
    const newPage = editCurrentPage + delta;
    if (newPage < 1 || newPage > editTotalPages) return;
    editCurrentPage = newPage;
    updatePageNav();
    renderEditPage();
}

function updatePageNav() {
    document.getElementById('edit-page-indicator').textContent = `Page ${editCurrentPage} of ${editTotalPages}`;
    document.getElementById('edit-prev-page').disabled = editCurrentPage <= 1;
    document.getElementById('edit-next-page').disabled = editCurrentPage >= editTotalPages;
}

// Get the canvas displayed size (accounts for CSS scaling)
function getCanvasRect() {
    return document.getElementById('edit-pdf-canvas').getBoundingClientRect();
}

// Handle click on canvas to place a new text annotation or signature
function handleCanvasClick(e) {
    if (!editPdfDoc) return;

    // Suppress click that fires right after a drag/draw operation
    if (editJustDragged) { editJustDragged = false; return; }

    // Edit text mode handles clicks via its own overlays
    if (editMode === 'edittext') return;

    // Ignore clicks on existing annotation/signature elements
    if (e.target.closest('.edit-ann-overlay') || e.target.closest('.edit-sig-overlay') || e.target.closest('.edit-rect-overlay')) return;

    const canvasRect = getCanvasRect();
    const clickX = e.clientX - canvasRect.left;
    const clickY = e.clientY - canvasRect.top;

    // Convert to percentage of displayed canvas size
    const xPct = (clickX / canvasRect.width) * 100;
    const yPct = (clickY / canvasRect.height) * 100;

    if (editMode === 'text') {
        const fontSize = parseInt(document.getElementById('edit-font-size').value) || 14;
        const color = document.getElementById('edit-text-color').value || '#000000';

        const ann = {
            id: editNextAnnotId++,
            text: '',
            x: xPct,
            y: yPct,
            page: editCurrentPage,
            fontSize: fontSize,
            color: color,
            widthPct: 20  // default width as % of canvas
        };

        editAnnotations.push(ann);
        renderAnnotationOverlays();
        updateAnnotationsList();

        // Auto-focus the new annotation input
        setTimeout(() => {
            const input = document.querySelector(`.edit-ann-overlay[data-id="${ann.id}"] input`);
            if (input) input.focus();
        }, 50);
    } else if (editMode === 'signature') {
        placeSignature(xPct, yPct);
    } else if (editMode === 'image') {
        placeImage(xPct, yPct);
    } else if (editMode === 'check') {
        placeSymbol(xPct, yPct, '\u2713', '#16a34a');  // green checkmark
    } else if (editMode === 'cross') {
        placeSymbol(xPct, yPct, '\u2717', '#dc2626');  // red cross
    }
    // draw, highlight, whiteout handled by mousedown/move/up
}

// Place a signature at the given percentage position
function placeSignature(xPct, yPct) {
    if (!editSigImageData) {
        alert('Please draw or upload a signature first, then click on the PDF to place it.');
        return;
    }

    // Load the image to get natural dimensions
    const img = new Image();
    img.onload = function () {
        const canvasRect = getCanvasRect();
        // Default signature width: ~20% of canvas
        const defaultWidthPct = 20;
        const aspectRatio = img.naturalHeight / img.naturalWidth;
        const defaultHeightPct = defaultWidthPct * aspectRatio * (canvasRect.width / canvasRect.height);

        const sig = {
            id: editNextSigId++,
            imageData: editSigImageData,
            x: xPct,
            y: yPct,
            page: editCurrentPage,
            widthPct: defaultWidthPct,
            heightPct: defaultHeightPct,
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight
        };

        editSignatures.push(sig);
        renderAnnotationOverlays();
        updateAnnotationsList();
    };
    img.src = editSigImageData;
}

// Place a check or cross symbol
function placeSymbol(xPct, yPct, symbol, color) {
    const fontSize = parseInt(document.getElementById('edit-font-size').value) || 14;
    const ann = {
        id: editNextAnnotId++,
        text: symbol,
        x: xPct,
        y: yPct,
        page: editCurrentPage,
        fontSize: fontSize,
        color: color,
        widthPct: 5
    };
    pushUndoState();
    editAnnotations.push(ann);
    renderAnnotationOverlays();
    updateAnnotationsList();
}

// Image tool: handle file upload
function handleEditImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (ev) {
        try {
            editImageData = await shrinkImageDataUrl(ev.target.result);
        } catch (error) {
            editImageData = null;
            alert('That image could not be used. Please choose a PNG, JPEG, GIF or WebP file.');
        }
        // Stay in image mode — user clicks PDF to place
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset so same file can be re-uploaded
}

// Place an uploaded image
function placeImage(xPct, yPct) {
    if (!editImageData) {
        // Trigger file picker again
        document.getElementById('edit-image-input').click();
        return;
    }
    const img = new Image();
    img.onload = function () {
        const canvasRect = getCanvasRect();
        const defaultWidthPct = 25;
        const aspectRatio = img.naturalHeight / img.naturalWidth;
        const defaultHeightPct = defaultWidthPct * aspectRatio * (canvasRect.width / canvasRect.height);

        const sig = {
            id: editNextSigId++,
            imageData: editImageData,
            x: xPct,
            y: yPct,
            page: editCurrentPage,
            widthPct: defaultWidthPct,
            heightPct: defaultHeightPct,
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight
        };
        pushUndoState();
        editSignatures.push(sig);
        renderAnnotationOverlays();
        updateAnnotationsList();
        editImageData = null; // clear after placing
    };
    img.src = editImageData;
}

// ---- Canvas mousedown/move/up for draw, highlight, whiteout ----
function handleCanvasMouseDown(e) {
    if (!editPdfDoc) return;
    if (editMode !== 'draw' && editMode !== 'highlight' && editMode !== 'whiteout') return;
    if (e.target && e.target.closest && (e.target.closest('.edit-ann-overlay') || e.target.closest('.edit-sig-overlay') || e.target.closest('.edit-rect-overlay'))) return;

    const canvasRect = getCanvasRect();
    const xPct = ((e.clientX - canvasRect.left) / canvasRect.width) * 100;
    const yPct = ((e.clientY - canvasRect.top) / canvasRect.height) * 100;

    editCanvasDragging = true;
    editDragStart = { xPct, yPct };
    editDragCurrent = { xPct, yPct };

    if (editMode === 'draw') {
        editDrawPoints = [{ xPct, yPct }];
    }

    if (e.preventDefault) e.preventDefault();
}

function handleCanvasMouseMove(e) {
    if (!editCanvasDragging) return;
    const canvasRect = getCanvasRect();
    const xPct = ((e.clientX - canvasRect.left) / canvasRect.width) * 100;
    const yPct = ((e.clientY - canvasRect.top) / canvasRect.height) * 100;
    editDragCurrent = { xPct, yPct };

    if (editMode === 'draw') {
        editDrawPoints.push({ xPct, yPct });
        renderDrawPreview();
    } else if (editMode === 'highlight' || editMode === 'whiteout') {
        renderRectPreview();
    }
}

function handleCanvasMouseUp() {
    if (!editCanvasDragging) return;
    editCanvasDragging = false;
    editJustDragged = true;

    if (editMode === 'draw' && editDrawPoints.length > 1) {
        pushUndoState();
        const color = document.getElementById('edit-draw-color').value || '#000000';
        const size = parseInt(document.getElementById('edit-draw-size').value) || 3;
        editDrawStrokes.push({
            page: editCurrentPage,
            points: [...editDrawPoints],
            color: color,
            size: size
        });
        editDrawPoints = [];
        removeDrawPreview();
        renderAnnotationOverlays();
        updateAnnotationsList();
    } else if ((editMode === 'highlight' || editMode === 'whiteout') && editDragStart) {
        const x = Math.min(editDragStart.xPct, editDragCurrent.xPct);
        const y = Math.min(editDragStart.yPct, editDragCurrent.yPct);
        const w = Math.abs(editDragCurrent.xPct - editDragStart.xPct);
        const h = Math.abs(editDragCurrent.yPct - editDragStart.yPct);
        if (w > 0.5 && h > 0.5) {
            pushUndoState();
            const color = editMode === 'highlight'
                ? (document.getElementById('edit-highlight-color').value || '#fbbf24')
                : '#ffffff';
            const opacity = editMode === 'highlight'
                ? (parseInt(document.getElementById('edit-highlight-opacity').value) || 40)
                : 100;
            editRects.push({
                id: editNextRectId++,
                type: editMode,
                x, y, w, h,
                page: editCurrentPage,
                color: color,
                opacity: opacity
            });
            removeRectPreview();
            renderAnnotationOverlays();
            updateAnnotationsList();
        } else {
            removeRectPreview();
        }
    }
    editDragStart = null;
    editDragCurrent = null;
}

// Draw preview (temporary freehand line while drawing)
function renderDrawPreview() {
    let preview = document.getElementById('edit-draw-preview');
    if (!preview) {
        preview = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        preview.id = 'edit-draw-preview';
        preview.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
        document.getElementById('edit-canvas-container').appendChild(preview);
    }
    const canvasRect = getCanvasRect();
    const color = document.getElementById('edit-draw-color').value || '#000000';
    const size = parseInt(document.getElementById('edit-draw-size').value) || 3;
    let d = '';
    editDrawPoints.forEach((p, i) => {
        const px = (p.xPct / 100) * canvasRect.width;
        const py = (p.yPct / 100) * canvasRect.height;
        d += (i === 0 ? 'M' : 'L') + px + ' ' + py;
    });
    preview.innerHTML = `<path d="${d}" fill="none" stroke="${color}" stroke-width="${size}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function removeDrawPreview() {
    const p = document.getElementById('edit-draw-preview');
    if (p) p.remove();
}

// Rectangle preview (temporary rect while dragging)
function renderRectPreview() {
    let preview = document.getElementById('edit-rect-preview');
    if (!preview) {
        preview = document.createElement('div');
        preview.id = 'edit-rect-preview';
        preview.style.cssText = 'position:absolute;pointer-events:none;z-index:5;border:2px dashed rgba(0,0,0,0.3);';
        document.getElementById('edit-canvas-container').appendChild(preview);
    }
    const canvasRect = getCanvasRect();
    const x = Math.min(editDragStart.xPct, editDragCurrent.xPct);
    const y = Math.min(editDragStart.yPct, editDragCurrent.yPct);
    const w = Math.abs(editDragCurrent.xPct - editDragStart.xPct);
    const h = Math.abs(editDragCurrent.yPct - editDragStart.yPct);
    preview.style.left = (x / 100) * canvasRect.width + 'px';
    preview.style.top = (y / 100) * canvasRect.height + 'px';
    preview.style.width = (w / 100) * canvasRect.width + 'px';
    preview.style.height = (h / 100) * canvasRect.height + 'px';

    if (editMode === 'highlight') {
        const color = document.getElementById('edit-highlight-color').value || '#fbbf24';
        const opacity = parseInt(document.getElementById('edit-highlight-opacity').value) || 40;
        preview.style.background = color;
        preview.style.opacity = opacity / 100;
    } else {
        preview.style.background = 'white';
        preview.style.opacity = '1';
    }
}

function removeRectPreview() {
    const p = document.getElementById('edit-rect-preview');
    if (p) p.remove();
}

function deleteRect(id) {
    pushUndoState();
    editRects = editRects.filter(r => r.id !== id);
    renderAnnotationOverlays();
    updateAnnotationsList();
}

function deleteDrawStroke(index) {
    pushUndoState();
    editDrawStrokes.splice(index, 1);
    renderAnnotationOverlays();
    updateAnnotationsList();
}

// ---- Undo / Redo ----
function getEditState() {
    return {
        annotations: JSON.parse(JSON.stringify(editAnnotations)),
        signatures: editSignatures.map(s => ({ ...s })),
        rects: JSON.parse(JSON.stringify(editRects)),
        drawStrokes: editDrawStrokes.map(s => ({ ...s, points: [...s.points] })),
        nextAnnotId: editNextAnnotId,
        nextSigId: editNextSigId,
        nextRectId: editNextRectId
    };
}

function restoreEditState(state) {
    editAnnotations = state.annotations;
    editSignatures = state.signatures;
    editRects = state.rects;
    editDrawStrokes = state.drawStrokes;
    editNextAnnotId = state.nextAnnotId;
    editNextSigId = state.nextSigId;
    editNextRectId = state.nextRectId;
    renderAnnotationOverlays();
    updateAnnotationsList();
    updateUndoRedoButtons();
}

function pushUndoState() {
    editUndoStack.push(getEditState());
    editRedoStack = [];
    if (editUndoStack.length > 50) editUndoStack.shift(); // limit history
    updateUndoRedoButtons();
}

function editUndo() {
    if (editUndoStack.length === 0) return;
    editRedoStack.push(getEditState());
    restoreEditState(editUndoStack.pop());
}

function editRedo() {
    if (editRedoStack.length === 0) return;
    editUndoStack.push(getEditState());
    restoreEditState(editRedoStack.pop());
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('edit-undo-btn');
    const redoBtn = document.getElementById('edit-redo-btn');
    if (undoBtn) undoBtn.disabled = editUndoStack.length === 0;
    if (redoBtn) redoBtn.disabled = editRedoStack.length === 0;
}

// Render annotation overlays on top of the canvas for the current page
function renderAnnotationOverlays() {
    const layer = document.getElementById('edit-annotations-layer');
    layer.innerHTML = '';

    const canvasRect = getCanvasRect();
    const displayW = canvasRect.width;
    const displayH = canvasRect.height;
    const pageAnns = editAnnotations.filter(a => a.page === editCurrentPage);

    pageAnns.forEach(ann => {
        const div = document.createElement('div');
        div.className = 'edit-ann-overlay';
        div.dataset.id = ann.id;
        div.style.left = (ann.x / 100) * displayW + 'px';
        div.style.top = (ann.y / 100) * displayH + 'px';
        div.style.fontSize = ann.fontSize + 'px';
        div.style.color = ann.color;

        // Drag handle
        const handle = document.createElement('span');
        handle.className = 'edit-ann-handle';
        handle.title = 'Drag to move';
        handle.textContent = '\u283f';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'edit-ann-input';
        input.value = ann.text;
        input.placeholder = 'Type here...';
        input.style.fontSize = ann.fontSize + 'px';
        input.style.color = ann.color;
        input.style.width = (ann.widthPct / 100) * displayW + 'px';
        input.addEventListener('input', (e) => {
            ann.text = e.target.value;
            updateAnnotationsList();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'edit-ann-delete';
        deleteBtn.textContent = '\u00d7';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteAnnotation(ann.id);
        });

        // Resize handle
        const resizeHandle = document.createElement('span');
        resizeHandle.className = 'edit-ann-resize';
        resizeHandle.title = 'Drag to resize width';

        // --- Dragging (move) ---
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        function startDrag(clientX, clientY) {
            isDragging = true;
            dragOffsetX = clientX - div.getBoundingClientRect().left;
            dragOffsetY = clientY - div.getBoundingClientRect().top;
            div.classList.add('dragging');
        }

        function moveDrag(clientX, clientY) {
            if (!isDragging) return;
            const cr = getCanvasRect();
            let newX = clientX - cr.left - dragOffsetX;
            let newY = clientY - cr.top - dragOffsetY;

            // Clamp within displayed canvas
            newX = Math.max(0, Math.min(newX, cr.width - 20));
            newY = Math.max(0, Math.min(newY, cr.height - 10));

            div.style.left = newX + 'px';
            div.style.top = newY + 'px';

            ann.x = (newX / cr.width) * 100;
            ann.y = (newY / cr.height) * 100;
        }

        function endDrag() {
            if (isDragging) {
                isDragging = false;
                div.classList.remove('dragging');
                updateAnnotationsList();
            }
        }

        // Mouse drag
        handle.addEventListener('mousedown', (e) => { startDrag(e.clientX, e.clientY); e.preventDefault(); });
        div.addEventListener('mousedown', (e) => {
            if (e.target === input || e.target === deleteBtn || e.target === resizeHandle) return;
            startDrag(e.clientX, e.clientY);
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
        document.addEventListener('mouseup', endDrag);

        // Touch drag
        handle.addEventListener('touchstart', (e) => { startDrag(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false });
        div.addEventListener('touchstart', (e) => {
            if (e.target === input || e.target === deleteBtn || e.target === resizeHandle) return;
            startDrag(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchmove', (e) => { if (!isDragging) return; moveDrag(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false });
        document.addEventListener('touchend', endDrag);

        // --- Resizing (width) ---
        let isResizing = false;
        let resizeStartX = 0;
        let resizeStartWidth = 0;

        function startResize(clientX) {
            isResizing = true;
            resizeStartX = clientX;
            resizeStartWidth = input.offsetWidth;
            div.classList.add('dragging');
        }

        function moveResize(clientX) {
            if (!isResizing) return;
            const cr = getCanvasRect();
            const delta = clientX - resizeStartX;
            const newWidth = Math.max(60, resizeStartWidth + delta);
            input.style.width = newWidth + 'px';
            ann.widthPct = (newWidth / cr.width) * 100;
        }

        function endResize() {
            if (isResizing) {
                isResizing = false;
                div.classList.remove('dragging');
                updateAnnotationsList();
            }
        }

        resizeHandle.addEventListener('mousedown', (e) => { startResize(e.clientX); e.preventDefault(); e.stopPropagation(); });
        document.addEventListener('mousemove', (e) => moveResize(e.clientX));
        document.addEventListener('mouseup', endResize);

        resizeHandle.addEventListener('touchstart', (e) => { startResize(e.touches[0].clientX); e.preventDefault(); e.stopPropagation(); }, { passive: false });
        document.addEventListener('touchmove', (e) => { if (!isResizing) return; moveResize(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
        document.addEventListener('touchend', endResize);

        div.appendChild(handle);
        div.appendChild(input);
        div.appendChild(resizeHandle);
        div.appendChild(deleteBtn);
        layer.appendChild(div);
    });

    // --- Render signature overlays ---
    const pageSigs = editSignatures.filter(s => s.page === editCurrentPage);
    pageSigs.forEach(sig => {
        const div = document.createElement('div');
        div.className = 'edit-sig-overlay';
        div.dataset.sigId = sig.id;

        const sigW = (sig.widthPct / 100) * displayW;
        const sigH = (sig.heightPct / 100) * displayH;
        div.style.left = (sig.x / 100) * displayW + 'px';
        div.style.top = (sig.y / 100) * displayH + 'px';
        div.style.width = sigW + 'px';
        div.style.height = sigH + 'px';

        const img = document.createElement('img');
        img.src = sig.imageData;
        img.className = 'edit-sig-img';
        img.draggable = false;

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'edit-ann-delete';
        deleteBtn.textContent = '\u00d7';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSignature(sig.id);
        });

        // Resize handle (bottom-right corner)
        const resizeHandle = document.createElement('span');
        resizeHandle.className = 'edit-sig-resize-handle';
        resizeHandle.title = 'Drag to resize';

        // --- Dragging ---
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        function startDrag(clientX, clientY) {
            isDragging = true;
            dragOffsetX = clientX - div.getBoundingClientRect().left;
            dragOffsetY = clientY - div.getBoundingClientRect().top;
            div.classList.add('dragging');
        }

        function moveDrag(clientX, clientY) {
            if (!isDragging) return;
            const cr = getCanvasRect();
            let newX = clientX - cr.left - dragOffsetX;
            let newY = clientY - cr.top - dragOffsetY;
            newX = Math.max(0, Math.min(newX, cr.width - 20));
            newY = Math.max(0, Math.min(newY, cr.height - 20));
            div.style.left = newX + 'px';
            div.style.top = newY + 'px';
            sig.x = (newX / cr.width) * 100;
            sig.y = (newY / cr.height) * 100;
        }

        function endDrag() {
            if (isDragging) {
                isDragging = false;
                div.classList.remove('dragging');
                updateAnnotationsList();
            }
        }

        div.addEventListener('mousedown', (e) => {
            if (e.target === deleteBtn || e.target === resizeHandle) return;
            startDrag(e.clientX, e.clientY); e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
        document.addEventListener('mouseup', endDrag);

        div.addEventListener('touchstart', (e) => {
            if (e.target === deleteBtn || e.target === resizeHandle) return;
            startDrag(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchmove', (e) => { if (!isDragging) return; moveDrag(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false });
        document.addEventListener('touchend', endDrag);

        // --- Resize (proportional) ---
        let isResizing = false;
        let resizeStartX = 0;
        let resizeStartW = 0;
        let resizeStartH = 0;

        function startSigResize(clientX) {
            isResizing = true;
            resizeStartX = clientX;
            resizeStartW = div.offsetWidth;
            resizeStartH = div.offsetHeight;
            div.classList.add('dragging');
        }

        function moveSigResize(clientX) {
            if (!isResizing) return;
            const cr = getCanvasRect();
            const delta = clientX - resizeStartX;
            const newW = Math.max(40, resizeStartW + delta);
            const aspect = resizeStartH / resizeStartW;
            const newH = newW * aspect;
            div.style.width = newW + 'px';
            div.style.height = newH + 'px';
            sig.widthPct = (newW / cr.width) * 100;
            sig.heightPct = (newH / cr.height) * 100;
        }

        function endSigResize() {
            if (isResizing) {
                isResizing = false;
                div.classList.remove('dragging');
                updateAnnotationsList();
            }
        }

        resizeHandle.addEventListener('mousedown', (e) => { startSigResize(e.clientX); e.preventDefault(); e.stopPropagation(); });
        document.addEventListener('mousemove', (e) => moveSigResize(e.clientX));
        document.addEventListener('mouseup', endSigResize);
        resizeHandle.addEventListener('touchstart', (e) => { startSigResize(e.touches[0].clientX); e.preventDefault(); e.stopPropagation(); }, { passive: false });
        document.addEventListener('touchmove', (e) => { if (!isResizing) return; moveSigResize(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
        document.addEventListener('touchend', endSigResize);

        div.appendChild(img);
        div.appendChild(resizeHandle);
        div.appendChild(deleteBtn);
        layer.appendChild(div);
    });

    // --- Render rectangle overlays (highlight / whiteout) ---
    const pageRects = editRects.filter(r => r.page === editCurrentPage);
    pageRects.forEach(rect => {
        const div = document.createElement('div');
        div.className = 'edit-rect-overlay';
        div.dataset.rectId = rect.id;
        div.style.left = (rect.x / 100) * displayW + 'px';
        div.style.top = (rect.y / 100) * displayH + 'px';
        div.style.width = (rect.w / 100) * displayW + 'px';
        div.style.height = (rect.h / 100) * displayH + 'px';
        div.style.background = rect.color;
        div.style.opacity = rect.opacity / 100;

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'edit-ann-delete';
        deleteBtn.textContent = '\u00d7';
        deleteBtn.style.opacity = '1';
        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteRect(rect.id); });
        div.appendChild(deleteBtn);
        layer.appendChild(div);
    });

    // --- Render draw strokes as SVG ---
    const pageStrokes = editDrawStrokes.filter(s => s.page === editCurrentPage);
    if (pageStrokes.length > 0) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;';
        pageStrokes.forEach((stroke, idx) => {
            let d = '';
            stroke.points.forEach((p, i) => {
                const px = (p.xPct / 100) * displayW;
                const py = (p.yPct / 100) * displayH;
                d += (i === 0 ? 'M' : 'L') + px + ' ' + py;
            });
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', stroke.color);
            path.setAttribute('stroke-width', stroke.size);
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            path.style.pointerEvents = 'stroke';
            path.style.cursor = 'pointer';
            path.addEventListener('click', () => deleteDrawStroke(idx));
            svg.appendChild(path);
        });
        layer.appendChild(svg);
    }

    // --- Render edit text overlays ---
    if (editMode === 'edittext') {
        renderEditTextOverlays(layer, displayW, displayH);
    }
}

// Extract text content from a PDF page using pdf.js
async function extractPageText(pageNum) {
    const page = await editPdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    const items = textContent.items
        .filter(item => item.str && item.str.trim())
        .map(item => {
            const b = item.transform[1];
            const c = item.transform[2];
            if (Math.abs(b) > 0.1 || Math.abs(c) > 0.1) return null;

            const fontSize = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 12;
            return {
                str: item.str,
                pdfX: item.transform[4],
                pdfY: item.transform[5],
                fontSize: fontSize,
                pdfWidth: item.width,
                fontName: item.fontName
            };
        })
        .filter(Boolean);

    items.sort((a, b) => {
        const yDiff = b.pdfY - a.pdfY;
        if (Math.abs(yDiff) > Math.min(a.fontSize, b.fontSize) * 0.3) return yDiff;
        return a.pdfX - b.pdfX;
    });

    const lines = [];
    let currentLine = null;

    items.forEach(item => {
        if (!currentLine || Math.abs(currentLine.pdfY - item.pdfY) > item.fontSize * 0.5) {
            currentLine = {
                items: [item],
                pdfY: item.pdfY,
                fontSize: item.fontSize
            };
            lines.push(currentLine);
        } else {
            currentLine.items.push(item);
        }
    });

    editTextItems[pageNum] = lines.map((line, index) => {
        const text = line.items.map(i => i.str).join('');
        const firstItem = line.items[0];
        const lastItem = line.items[line.items.length - 1];
        const pdfX = firstItem.pdfX;
        const pdfWidth = (lastItem.pdfX + lastItem.pdfWidth) - pdfX;
        const fontSize = line.fontSize;

        return {
            id: `${pageNum}-${index}`,
            page: parseInt(pageNum),
            originalText: text,
            text: text,
            pdfX: pdfX,
            pdfY: line.pdfY,
            pdfWidth: Math.max(pdfWidth, 10),
            fontSize: fontSize,
            xPct: (pdfX / pageWidth) * 100,
            yPct: ((pageHeight - line.pdfY) / pageHeight) * 100,
            widthPct: (Math.max(pdfWidth, 10) / pageWidth) * 100,
            heightPct: ((fontSize * 1.2) / pageHeight) * 100,
            pageWidth: pageWidth,
            pageHeight: pageHeight
        };
    });
}

// Render editable text overlays for existing PDF text
function renderEditTextOverlays(layer, displayW, displayH) {
    const pageLines = editTextItems[editCurrentPage] || [];

    if (pageLines.length === 0 && editTextExtracted[editCurrentPage]) {
        const notice = document.createElement('div');
        notice.className = 'edit-text-notice';
        notice.textContent = 'No editable text found on this page.';
        layer.appendChild(notice);
        return;
    }

    pageLines.forEach(line => {
        const div = document.createElement('div');
        div.className = 'edit-text-overlay';
        if (line.text !== line.originalText) div.classList.add('modified');

        const leftPx = (line.xPct / 100) * displayW;
        const baselinePx = (line.yPct / 100) * displayH;
        const fontSizePx = (line.fontSize / line.pageHeight) * displayH;
        const topPx = baselinePx - fontSizePx * 0.85;
        const widthPx = Math.max((line.widthPct / 100) * displayW, 40);
        const heightPx = fontSizePx * 1.2;

        div.style.left = leftPx + 'px';
        div.style.top = topPx + 'px';
        div.style.width = widthPx + 'px';
        div.style.height = heightPx + 'px';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'edit-text-input';
        input.value = line.text;
        input.style.fontSize = fontSizePx + 'px';
        input.style.height = heightPx + 'px';
        input.style.lineHeight = heightPx + 'px';

        input.addEventListener('input', (e) => {
            line.text = e.target.value;
            div.classList.toggle('modified', line.text !== line.originalText);
        });
        input.addEventListener('focus', () => div.classList.add('editing'));
        input.addEventListener('blur', () => div.classList.remove('editing'));

        div.appendChild(input);
        layer.appendChild(div);
    });
}

async function extractAndShowPageText() {
    if (!editTextExtracted[editCurrentPage]) {
        await extractPageText(editCurrentPage);
        editTextExtracted[editCurrentPage] = true;
    }
    renderAnnotationOverlays();
}

// Collect all modified text items across all pages
function getTextEdits() {
    const edits = [];
    for (const pageNum of Object.keys(editTextItems)) {
        const lines = editTextItems[pageNum];
        for (const line of lines) {
            if (line.text !== line.originalText) {
                edits.push({
                    page: line.page,
                    originalText: line.originalText,
                    newText: line.text,
                    pdfX: line.pdfX,
                    pdfY: line.pdfY,
                    pdfWidth: line.pdfWidth,
                    fontSize: line.fontSize
                });
            }
        }
    }
    return edits;
}

function deleteSignature(id) {
    pushUndoState();
    editSignatures = editSignatures.filter(s => s.id !== id);
    renderAnnotationOverlays();
    updateAnnotationsList();
}

// Update the annotations list panel
function updateAnnotationsList() {
    const listEl = document.getElementById('edit-annotations-list');
    const countEl = document.getElementById('edit-ann-count');
    const textEditCount = Object.values(editTextItems).flat().filter(l => l.text !== l.originalText).length;
    const totalCount = editAnnotations.length + editSignatures.length + editRects.length + editDrawStrokes.length + textEditCount;
    countEl.textContent = `(${totalCount})`;

    if (totalCount === 0) {
        listEl.innerHTML = '<p class="edit-ann-empty">Click on the PDF above to add text, signatures, or annotations.</p>';
        return;
    }

    listEl.innerHTML = '';
    editAnnotations.forEach(ann => {
        listEl.appendChild(buildAnnotationListItem({
            page: ann.page,
            label: ann.text || '(empty)',
            info: `${ann.fontSize}px`,
            color: ann.color,
            action: 'deleteAnnotation',
            id: ann.id,
            onSelect: () => {
                // Click to navigate to annotation's page
                if (ann.page !== editCurrentPage) {
                    editCurrentPage = ann.page;
                    updatePageNav();
                    renderEditPage();
                }
                // Highlight the annotation
                const overlay = document.querySelector(`.edit-ann-overlay[data-id="${ann.id}"] input`);
                if (overlay) overlay.focus();
            }
        }));
    });

    // Signature items in the list
    editSignatures.forEach(sig => {
        listEl.appendChild(buildAnnotationListItem({
            page: sig.page,
            label: '✍️ Signature',
            info: 'img',
            action: 'deleteSignature',
            id: sig.id,
            onSelect: () => {
                if (sig.page !== editCurrentPage) {
                    editCurrentPage = sig.page;
                    updatePageNav();
                    renderEditPage();
                }
            }
        }));
    });
}

// Built with DOM APIs (text content, data-action) rather than HTML strings so user text is never
// interpreted as markup and the strict CSP (no inline handlers/styles) is respected.
function buildAnnotationListItem({ page, label, info, color, action, id, onSelect }) {
    const item = document.createElement('div');
    item.className = 'edit-ann-list-item';
    if (page === editCurrentPage) item.classList.add('current-page');

    const pageEl = document.createElement('span');
    pageEl.className = 'edit-ann-list-page';
    pageEl.textContent = `P${page}`;
    const textEl = document.createElement('span');
    textEl.className = 'edit-ann-list-text';
    textEl.textContent = label;
    const infoEl = document.createElement('span');
    infoEl.className = 'edit-ann-list-info';
    infoEl.textContent = info;
    item.append(pageEl, textEl, infoEl);

    if (color) {
        const swatch = document.createElement('span');
        swatch.className = 'edit-ann-list-color';
        swatch.style.background = color;
        item.appendChild(swatch);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'edit-ann-list-delete';
    remove.dataset.action = action;
    remove.dataset.arg = String(id);
    remove.textContent = '×';
    item.appendChild(remove);

    item.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        onSelect();
    });
    return item;
}

function deleteAnnotation(id) {
    pushUndoState();
    editAnnotations = editAnnotations.filter(a => a.id !== id);
    renderAnnotationOverlays();
    updateAnnotationsList();
}

function setEditMode(mode) {
    const prevMode = editMode;
    editMode = mode;

    // Update active button state for all mode buttons
    EDIT_MODES.forEach(m => {
        const btn = document.getElementById('edit-mode-' + (m === 'signature' ? 'sign' : m));
        if (btn) btn.classList.toggle('active', m === mode);
    });

    // Show/hide contextual options
    const textOpts = document.getElementById('edit-text-options');
    const drawOpts = document.getElementById('edit-draw-options');
    const hlOpts = document.getElementById('edit-highlight-options');
    if (textOpts) textOpts.classList.toggle('hidden', !(mode === 'text' || mode === 'check' || mode === 'cross' || mode === 'edittext'));
    if (drawOpts) drawOpts.classList.toggle('hidden', mode !== 'draw');
    if (hlOpts) hlOpts.classList.toggle('hidden', mode !== 'highlight');

    // Show/hide signature panel
    document.getElementById('edit-sig-panel').classList.toggle('hidden', mode !== 'signature');

    // Update canvas cursor
    const container = document.getElementById('edit-canvas-container');
    if (container) {
        if (mode === 'edittext') container.style.cursor = 'default';
        else container.style.cursor = 'crosshair';
    }

    // Init signature canvas on first switch
    if (mode === 'signature' && !editSigCanvas) {
        initEditSigCanvas();
    }

    // Image mode: trigger file picker
    if (mode === 'image') {
        document.getElementById('edit-image-input').click();
    }

    // Edit text mode: extract text and show overlays
    if (mode === 'edittext' && editPdfDoc) {
        extractAndShowPageText();
    } else if (prevMode === 'edittext') {
        renderAnnotationOverlays();
    }
}

// ---- Signature Drawing Canvas ----
function initEditSigCanvas() {
    editSigCanvas = document.getElementById('edit-signature-pad');
    if (!editSigCanvas) return;
    editSigCtx = editSigCanvas.getContext('2d');
    const container = editSigCanvas.parentElement;
    editSigCanvas.width = container.offsetWidth - 4;
    editSigCanvas.height = 120;
    clearEditSignature();

    editSigCanvas.addEventListener('mousedown', editSigStartDraw);
    editSigCanvas.addEventListener('mousemove', editSigDraw);
    editSigCanvas.addEventListener('mouseup', editSigStopDraw);
    editSigCanvas.addEventListener('mouseout', editSigStopDraw);

    editSigCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        editSigCanvas.dispatchEvent(new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY }));
    }, { passive: false });
    editSigCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        editSigCanvas.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }));
    }, { passive: false });
    editSigCanvas.addEventListener('touchend', () => {
        editSigCanvas.dispatchEvent(new MouseEvent('mouseup', {}));
    });
}

function editSigStartDraw(e) {
    editSigDrawing = true;
    editSigCtx.beginPath();
    editSigCtx.moveTo(
        e.clientX - editSigCanvas.getBoundingClientRect().left,
        e.clientY - editSigCanvas.getBoundingClientRect().top
    );
}

function editSigDraw(e) {
    if (!editSigDrawing) return;
    editSigCtx.lineWidth = 2;
    editSigCtx.lineCap = 'round';
    editSigCtx.strokeStyle = '#000';
    editSigCtx.lineTo(
        e.clientX - editSigCanvas.getBoundingClientRect().left,
        e.clientY - editSigCanvas.getBoundingClientRect().top
    );
    editSigCtx.stroke();
    editSigHasDrawn = true;
    document.getElementById('edit-sig-confirm-btn').disabled = false;
}

function editSigStopDraw() {
    editSigDrawing = false;
}

function clearEditSignature() {
    if (editSigCtx) {
        editSigCtx.fillStyle = 'white';
        editSigCtx.fillRect(0, 0, editSigCanvas.width, editSigCanvas.height);
        editSigHasDrawn = false;
        document.getElementById('edit-sig-confirm-btn').disabled = true;
    }
    editSigImageData = null;
    document.getElementById('edit-sig-preview').classList.add('hidden');
}

function confirmEditSignature() {
    if (!editSigHasDrawn) return;
    // Trim the signature canvas to content bounds
    editSigImageData = trimCanvasToContent(editSigCanvas);
    showEditSigPreview(editSigImageData);
}

// Trim whitespace from signature canvas and return data URL
function trimCanvasToContent(canvas) {
    const ctx = canvas.getContext('2d');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    let top = canvas.height, left = canvas.width, bottom = 0, right = 0;
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            // Check if pixel is not white
            if (data[idx] < 250 || data[idx + 1] < 250 || data[idx + 2] < 250) {
                if (y < top) top = y;
                if (y > bottom) bottom = y;
                if (x < left) left = x;
                if (x > right) right = x;
            }
        }
    }
    if (bottom <= top || right <= left) return canvas.toDataURL('image/png');
    const pad = 4;
    top = Math.max(0, top - pad);
    left = Math.max(0, left - pad);
    bottom = Math.min(canvas.height - 1, bottom + pad);
    right = Math.min(canvas.width - 1, right + pad);
    const trimmed = document.createElement('canvas');
    trimmed.width = right - left + 1;
    trimmed.height = bottom - top + 1;
    const tctx = trimmed.getContext('2d');
    // Make background transparent
    tctx.drawImage(canvas, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
    // Replace white pixels with transparency
    const tData = tctx.getImageData(0, 0, trimmed.width, trimmed.height);
    for (let i = 0; i < tData.data.length; i += 4) {
        if (tData.data[i] > 240 && tData.data[i + 1] > 240 && tData.data[i + 2] > 240) {
            tData.data[i + 3] = 0; // transparent
        }
    }
    tctx.putImageData(tData, 0, 0);
    return trimmed.toDataURL('image/png');
}

function showEditSigPreview(dataUrl) {
    const preview = document.getElementById('edit-sig-preview');
    const img = document.getElementById('edit-sig-preview-img');
    img.src = dataUrl;
    preview.classList.remove('hidden');
}

function switchEditSigTab(tab) {
    document.querySelectorAll('.edit-sig-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('edit-sig-draw-panel').classList.toggle('hidden', tab !== 'draw');
    document.getElementById('edit-sig-upload-panel').classList.toggle('hidden', tab !== 'upload');
}

// Handle signature image upload
function handleEditSigUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (ev) {
        try {
            editSigImageData = await shrinkImageDataUrl(ev.target.result);
            showEditSigPreview(editSigImageData);
        } catch (error) {
            editSigImageData = null;
            alert('That image could not be used. Please choose a PNG, JPEG, GIF or WebP file.');
        }
    };
    reader.readAsDataURL(file);
}

function removeEditPdf() {
    editPdfFile = null;
    editPdfDoc = null;
    editAnnotations = [];
    editNextAnnotId = 1;
    editSignatures = [];
    editNextSigId = 1;
    editSigImageData = null;
    editRects = [];
    editNextRectId = 1;
    editDrawStrokes = [];
    editImageData = null;
    editUndoStack = [];
    editRedoStack = [];
    editTextItems = {};
    editTextExtracted = {};
    editCurrentPage = 1;
    editTotalPages = 0;

    document.getElementById('edit-upload-area').classList.remove('hidden');
    document.getElementById('edit-editor').classList.add('hidden');
    document.getElementById('edit-btn').disabled = true;
    document.getElementById('edit-pdf-input').value = '';
    document.getElementById('edit-result').classList.add('hidden');
    setEditMode('text');
}

async function handleEditPdfSubmit(e) {
    e.preventDefault();

    if (!editPdfFile) return;

    // Filter out empty text annotations
    const validAnnotations = editAnnotations.filter(a => a.text && a.text.trim());

    // Collect text edits (existing text that was modified)
    const textEditsPayload = getTextEdits();

    const hasContent = validAnnotations.length > 0 || editSignatures.length > 0 || editRects.length > 0 || editDrawStrokes.length > 0 || textEditsPayload.length > 0;
    if (!hasContent) {
        alert('Please add at least one annotation or text edit before applying changes.');
        return;
    }

    const btn = document.getElementById('edit-btn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');
    const result = document.getElementById('edit-result');

    btn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
    result.classList.add('hidden');

    try {
        const formData = new FormData();
        formData.append('pdf', editPdfFile);
        formData.append('outputFilename', document.getElementById('edit-output-filename').value || 'edited-document');

        // Serialize text annotations
        const annotationsPayload = validAnnotations.map(a => ({
            text: a.text,
            x: a.x,
            y: a.y,
            page: a.page,
            fontSize: a.fontSize,
            color: a.color
        }));
        formData.append('annotations', JSON.stringify(annotationsPayload));

        // Serialize signature annotations
        const signaturesPayload = editSignatures.map(s => ({
            imageData: s.imageData,
            x: s.x,
            y: s.y,
            page: s.page,
            widthPct: s.widthPct,
            heightPct: s.heightPct
        }));
        formData.append('signatures', JSON.stringify(signaturesPayload));

        // Serialize rectangles (highlight/whiteout)
        const rectsPayload = editRects.map(r => ({
            type: r.type, x: r.x, y: r.y, w: r.w, h: r.h,
            page: r.page, color: r.color, opacity: r.opacity
        }));
        formData.append('rectangles', JSON.stringify(rectsPayload));

        // Serialize freehand strokes as compact point lists; the server draws them as vector lines
        const strokesPayload = editDrawStrokes.map(s => ({
            page: s.page,
            color: s.color,
            size: s.size,
            points: simplifyStroke(s.points)
        }));
        formData.append('drawStrokes', JSON.stringify(strokesPayload));

        // Serialize text edits
        if (textEditsPayload.length > 0) {
            formData.append('textEdits', JSON.stringify(textEditsPayload));
        }

        const oversized = [...formData.entries()].find(([, value]) => typeof value === 'string' && new Blob([value]).size > MAX_EDIT_FIELD_BYTES);
        if (oversized) {
            alert('There is too much content to send at once (' + oversized[0] + '). Remove some images or signatures and try again.');
            return;
        }
        const response = await fetch('api/edit', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('edit-result-message').textContent = data.message;
            document.getElementById('edit-download-link').href = data.downloadUrl;
            result.classList.remove('hidden');
        } else {
            alert(data.error || 'Edit failed');
        }
    } catch (error) {
        alert('An error occurred: ' + error.message);
    } finally {
        btn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
    }
}

function resetEditPdfForm() {
    editPdfFile = null;
    editPdfDoc = null;
    editAnnotations = [];
    editNextAnnotId = 1;
    editSignatures = [];
    editNextSigId = 1;
    editSigImageData = null;
    editRects = [];
    editNextRectId = 1;
    editDrawStrokes = [];
    editImageData = null;
    editUndoStack = [];
    editRedoStack = [];
    editTextItems = {};
    editTextExtracted = {};
    editCurrentPage = 1;
    editTotalPages = 0;
    document.getElementById('edit-upload-area').classList.remove('hidden');
    document.getElementById('edit-editor').classList.add('hidden');
    document.getElementById('edit-result').classList.add('hidden');
    document.getElementById('edit-pdf-input').value = '';
    document.getElementById('edit-output-filename').value = 'edited-document';
    document.getElementById('edit-btn').disabled = true;
    setEditMode('text');
}

// ==================== SIGN PDF ====================
let signPdfFile = null;
let signatureCanvas = null;
let signatureCtx = null;
let isDrawing = false;
let hasSignature = false;

function initSignPdf() {
    const uploadArea = document.getElementById('sign-upload-area');
    const fileInput = document.getElementById('sign-pdf-input');
    const form = document.getElementById('sign-pdf-form');
    
    // Click to browse
    uploadArea.addEventListener('click', () => fileInput.click());
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            signPdfFile = e.target.files[0];
            showSignPdfInfo();
        }
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            signPdfFile = files[0];
            showSignPdfInfo();
        }
    });
    
    // Signature tabs
    document.querySelectorAll('.sig-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sig-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabName = tab.dataset.tab;
            document.getElementById('draw-signature-panel').classList.toggle('hidden', tabName !== 'draw');
            document.getElementById('upload-signature-panel').classList.toggle('hidden', tabName !== 'upload');
        });
    });
    
    // Form submit
    form.addEventListener('submit', handleSignPdfSubmit);
}

function initSignatureCanvas() {
    signatureCanvas = document.getElementById('signature-pad');
    if (!signatureCanvas) return;
    
    signatureCtx = signatureCanvas.getContext('2d');
    
    // Set canvas size
    const container = signatureCanvas.parentElement;
    signatureCanvas.width = container.offsetWidth - 4;
    signatureCanvas.height = 150;
    
    // Clear canvas
    signatureCtx.fillStyle = 'white';
    signatureCtx.fillRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    
    // Drawing events
    signatureCanvas.addEventListener('mousedown', startDrawing);
    signatureCanvas.addEventListener('mousemove', draw);
    signatureCanvas.addEventListener('mouseup', stopDrawing);
    signatureCanvas.addEventListener('mouseout', stopDrawing);
    
    // Touch events
    signatureCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        signatureCanvas.dispatchEvent(mouseEvent);
    });
    
    signatureCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        signatureCanvas.dispatchEvent(mouseEvent);
    });
    
    signatureCanvas.addEventListener('touchend', () => {
        const mouseEvent = new MouseEvent('mouseup', {});
        signatureCanvas.dispatchEvent(mouseEvent);
    });
}

function startDrawing(e) {
    isDrawing = true;
    signatureCtx.beginPath();
    signatureCtx.moveTo(
        e.clientX - signatureCanvas.getBoundingClientRect().left,
        e.clientY - signatureCanvas.getBoundingClientRect().top
    );
}

function draw(e) {
    if (!isDrawing) return;
    
    signatureCtx.lineWidth = 2;
    signatureCtx.lineCap = 'round';
    signatureCtx.strokeStyle = '#000';
    
    signatureCtx.lineTo(
        e.clientX - signatureCanvas.getBoundingClientRect().left,
        e.clientY - signatureCanvas.getBoundingClientRect().top
    );
    signatureCtx.stroke();
    hasSignature = true;
    updateSignButton();
}

function stopDrawing() {
    isDrawing = false;
}

function clearSignature() {
    if (signatureCtx) {
        signatureCtx.fillStyle = 'white';
        signatureCtx.fillRect(0, 0, signatureCanvas.width, signatureCanvas.height);
        hasSignature = false;
        updateSignButton();
    }
}

function showSignPdfInfo() {
    const uploadArea = document.getElementById('sign-upload-area');
    const fileInfo = document.getElementById('sign-pdf-info');
    const fileName = document.getElementById('sign-pdf-name');
    
    uploadArea.classList.add('hidden');
    fileInfo.classList.remove('hidden');
    fileName.textContent = signPdfFile.name;
    updateSignButton();
}

function removeSignPdf() {
    signPdfFile = null;
    const uploadArea = document.getElementById('sign-upload-area');
    const fileInfo = document.getElementById('sign-pdf-info');
    
    uploadArea.classList.remove('hidden');
    fileInfo.classList.add('hidden');
    document.getElementById('sign-pdf-input').value = '';
    updateSignButton();
}

function updateSignButton() {
    const btn = document.getElementById('sign-btn');
    const uploadedSig = document.getElementById('sign-signature-image').files.length > 0;
    btn.disabled = !signPdfFile || (!hasSignature && !uploadedSig);
}

async function handleSignPdfSubmit(e) {
    e.preventDefault();
    
    if (!signPdfFile) return;
    
    const btn = document.getElementById('sign-btn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');
    const result = document.getElementById('sign-result');
    
    btn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
    result.classList.add('hidden');
    
    try {
        const formData = new FormData();
        formData.append('pdf', signPdfFile);
        formData.append('outputFilename', document.getElementById('sign-output-filename').value || 'signed-document');
        formData.append('signatureX', document.getElementById('sign-x').value);
        formData.append('signatureY', document.getElementById('sign-y').value);
        formData.append('signatureScale', document.getElementById('sign-scale').value);
        formData.append('pageNumber', document.getElementById('sign-page-number').value);
        
        // Check which signature method is active
        const drawTabActive = document.querySelector('.sig-tab[data-tab="draw"]').classList.contains('active');
        
        if (drawTabActive && hasSignature) {
            // Get signature from canvas as data URL
            const signatureData = signatureCanvas.toDataURL('image/png');
            formData.append('signatureData', signatureData);
        } else {
            // Use uploaded signature image
            const sigImage = document.getElementById('sign-signature-image').files[0];
            if (sigImage) {
                formData.append('signatureImage', sigImage);
            }
        }
        
        const response = await fetch('api/sign', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('sign-result-message').textContent = data.message;
            document.getElementById('sign-download-link').href = data.downloadUrl;
            result.classList.remove('hidden');
        } else {
            alert(data.error || 'Signing failed');
        }
    } catch (error) {
        alert('An error occurred: ' + error.message);
    } finally {
        btn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
    }
}

function resetSignPdfForm() {
    signPdfFile = null;
    hasSignature = false;
    document.getElementById('sign-upload-area').classList.remove('hidden');
    document.getElementById('sign-pdf-info').classList.add('hidden');
    document.getElementById('sign-result').classList.add('hidden');
    document.getElementById('sign-pdf-input').value = '';
    document.getElementById('sign-output-filename').value = 'signed-document';
    document.getElementById('sign-signature-image').value = '';
    document.getElementById('sign-btn').disabled = true;
    if (signatureCtx) {
        clearSignature();
    }
}

// ==================== PDF TO IMAGE ====================
let p2iPdfFile = null;
let p2iPdfDoc = null;

function initPdfToImage() {
    const uploadArea = document.getElementById('p2i-upload-area');
    const fileInput = document.getElementById('p2i-pdf-input');

    uploadArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            p2iPdfFile = e.target.files[0];
            loadP2iPdf();
        }
    });

    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            p2iPdfFile = files[0];
            loadP2iPdf();
        }
    });

    // Toggle JPEG quality visibility
    document.getElementById('p2i-format').addEventListener('change', (e) => {
        document.getElementById('p2i-quality-group').classList.toggle('hidden', e.target.value !== 'jpeg');
    });
    // Init: hide quality for PNG
    document.getElementById('p2i-quality-group').classList.add('hidden');
}

async function loadP2iPdf() {
    if (!p2iPdfFile) return;
    const arrayBuffer = await p2iPdfFile.arrayBuffer();
    p2iPdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    document.getElementById('p2i-upload-area').classList.add('hidden');
    document.getElementById('p2i-editor').classList.remove('hidden');
    document.getElementById('p2i-pdf-name').textContent = `${p2iPdfFile.name} (${p2iPdfDoc.numPages} page${p2iPdfDoc.numPages > 1 ? 's' : ''})`;
}

function removeP2iPdf() {
    p2iPdfFile = null;
    p2iPdfDoc = null;
    document.getElementById('p2i-upload-area').classList.remove('hidden');
    document.getElementById('p2i-editor').classList.add('hidden');
    document.getElementById('p2i-result').classList.add('hidden');
    document.getElementById('p2i-pdf-input').value = '';
}

function resetPdfToImageForm() {
    removeP2iPdf();
}

async function convertPdfToImage() {
    if (!p2iPdfDoc) return;

    const format = document.getElementById('p2i-format').value;
    const scale = parseFloat(document.getElementById('p2i-scale').value) || 2;
    const quality = parseInt(document.getElementById('p2i-quality').value) / 100;
    const pagesOption = document.getElementById('p2i-pages').value;
    const totalPages = pagesOption === 'first' ? 1 : p2iPdfDoc.numPages;

    const btn = document.getElementById('p2i-btn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');
    const progress = document.getElementById('p2i-progress');
    const progressBar = document.getElementById('p2i-progress-bar');
    const progressText = document.getElementById('p2i-progress-text');
    const resultDiv = document.getElementById('p2i-result');
    const imagesDiv = document.getElementById('p2i-images');

    btn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
    progress.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    imagesDiv.innerHTML = '';

    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const baseName = p2iPdfFile.name.replace(/\.pdf$/i, '');

    try {
        for (let i = 1; i <= totalPages; i++) {
            progressText.textContent = `Rendering page ${i} of ${totalPages}...`;
            progressBar.style.width = ((i - 1) / totalPages * 100) + '%';

            const page = await p2iPdfDoc.getPage(i);
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            await page.render({ canvasContext: ctx, viewport }).promise;

            const dataUrl = format === 'jpeg'
                ? canvas.toDataURL(mimeType, quality)
                : canvas.toDataURL(mimeType);

            // Build preview + download link
            const item = document.createElement('div');
            item.className = 'p2i-result-item';
            const fileName = totalPages === 1 ? `${baseName}.${ext}` : `${baseName}-page${i}.${ext}`;
            const image = document.createElement('img');
            image.src = dataUrl;
            image.alt = `Page ${i}`;
            const actions = document.createElement('div');
            actions.className = 'p2i-result-actions';
            const label = document.createElement('span');
            label.className = 'file-name';
            label.textContent = `Page ${i}`;
            const link = document.createElement('a');
            link.className = 'p2i-download-link';
            link.href = dataUrl;
            link.download = fileName;
            link.textContent = 'Download';
            actions.append(label, link);
            item.append(image, actions);
            imagesDiv.appendChild(item);

            progressBar.style.width = (i / totalPages * 100) + '%';
        }

        progressText.textContent = 'Done!';
        document.getElementById('p2i-result-message').textContent = `Converted ${totalPages} page${totalPages > 1 ? 's' : ''} to ${ext.toUpperCase()}.`;
        resultDiv.classList.remove('hidden');

    } catch (error) {
        alert('Conversion failed: ' + error.message);
    } finally {
        btn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
    }
}

// Listen for signature image upload
document.addEventListener('DOMContentLoaded', () => {
    const sigImageInput = document.getElementById('sign-signature-image');
    if (sigImageInput) {
        sigImageInput.addEventListener('change', updateSignButton);
    }

    // Edit tool: signature image upload
    const editSigUploadInput = document.getElementById('edit-sig-upload-input');
    if (editSigUploadInput) {
        editSigUploadInput.addEventListener('change', handleEditSigUpload);
    }
});
