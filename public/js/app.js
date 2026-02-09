// Click PDF Toolkit - Frontend JavaScript

document.addEventListener('DOMContentLoaded', () => {
    initToolCards();
    initImageToPdf();
    initEditPdf();
    initSignPdf();
    initRangeSliders();
});

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
    const comingSoonTool = document.getElementById('coming-soon-tool');
    
    // Hide all tools first
    imageToPdfTool.classList.add('hidden');
    editTool.classList.add('hidden');
    signTool.classList.add('hidden');
    comingSoonTool.classList.add('hidden');
    
    // Hide tool grid, show workspace
    toolGrid.classList.add('hidden');
    workspace.classList.remove('hidden');
    
    // Show appropriate tool
    if (tool === 'image-to-pdf') {
        imageToPdfTool.classList.remove('hidden');
    } else if (tool === 'edit') {
        editTool.classList.remove('hidden');
    } else if (tool === 'sign') {
        signTool.classList.remove('hidden');
        initSignatureCanvas();
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
            'pdf-to-image': '🖼️ PDF to Image',
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
            item.innerHTML = `
                <span class="order-badge">${index + 1}</span>
                <img src="${e.target.result}" alt="${file.name}">
                <button type="button" class="remove-btn" onclick="removeFile(${index})">×</button>
                <span class="file-name">${file.name}</span>
            `;
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
    const existingError = document.querySelector('.error-message');
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
        
        const response = await fetch('/api/image-to-pdf', {
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
    
    const existingError = document.querySelector('.error-message');
    if (existingError) existingError.remove();
}

// ==================== EDIT PDF ====================
let editPdfFile = null;

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
            showEditPdfInfo();
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
            showEditPdfInfo();
        }
    });
    
    // Form submit
    form.addEventListener('submit', handleEditPdfSubmit);
}

function showEditPdfInfo() {
    const uploadArea = document.getElementById('edit-upload-area');
    const fileInfo = document.getElementById('edit-pdf-info');
    const fileName = document.getElementById('edit-pdf-name');
    const btn = document.getElementById('edit-btn');
    
    uploadArea.classList.add('hidden');
    fileInfo.classList.remove('hidden');
    fileName.textContent = editPdfFile.name;
    btn.disabled = false;
}

function removeEditPdf() {
    editPdfFile = null;
    const uploadArea = document.getElementById('edit-upload-area');
    const fileInfo = document.getElementById('edit-pdf-info');
    const btn = document.getElementById('edit-btn');
    
    uploadArea.classList.remove('hidden');
    fileInfo.classList.add('hidden');
    btn.disabled = true;
    document.getElementById('edit-pdf-input').value = '';
}

async function handleEditPdfSubmit(e) {
    e.preventDefault();
    
    if (!editPdfFile) return;
    
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
        formData.append('text', document.getElementById('edit-text').value);
        formData.append('fontSize', document.getElementById('edit-font-size').value);
        formData.append('textColor', document.getElementById('edit-text-color').value);
        formData.append('textX', document.getElementById('edit-text-x').value);
        formData.append('textY', document.getElementById('edit-text-y').value);
        formData.append('pageNumber', document.getElementById('edit-page-number').value);
        
        // Add overlay image if selected
        const overlayImage = document.getElementById('edit-overlay-image').files[0];
        if (overlayImage) {
            formData.append('overlayImage', overlayImage);
            formData.append('imageX', document.getElementById('edit-image-x').value);
            formData.append('imageY', document.getElementById('edit-image-y').value);
            formData.append('imageScale', document.getElementById('edit-image-scale').value);
        }
        
        const response = await fetch('/api/edit', {
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
    document.getElementById('edit-upload-area').classList.remove('hidden');
    document.getElementById('edit-pdf-info').classList.add('hidden');
    document.getElementById('edit-result').classList.add('hidden');
    document.getElementById('edit-pdf-input').value = '';
    document.getElementById('edit-output-filename').value = 'edited-document';
    document.getElementById('edit-text').value = '';
    document.getElementById('edit-btn').disabled = true;
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
        
        const response = await fetch('/api/sign', {
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

// Make functions globally accessible
window.showToolGrid = showToolGrid;
window.removeFile = removeFile;
window.removeEditPdf = removeEditPdf;
window.removeSignPdf = removeSignPdf;
window.clearSignature = clearSignature;

// Listen for signature image upload
document.addEventListener('DOMContentLoaded', () => {
    const sigImageInput = document.getElementById('sign-signature-image');
    if (sigImageInput) {
        sigImageInput.addEventListener('change', updateSignButton);
    }
});
