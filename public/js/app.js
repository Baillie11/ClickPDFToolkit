// Click PDF Toolkit - Frontend JavaScript

document.addEventListener('DOMContentLoaded', () => {
    initToolCards();
    initImageToPdf();
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
    const comingSoonTool = document.getElementById('coming-soon-tool');
    
    // Hide tool grid, show workspace
    toolGrid.classList.add('hidden');
    workspace.classList.remove('hidden');
    
    // Show appropriate tool
    if (tool === 'image-to-pdf') {
        imageToPdfTool.classList.remove('hidden');
        comingSoonTool.classList.add('hidden');
    } else {
        imageToPdfTool.classList.add('hidden');
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
            'edit': '✏️ Edit PDF',
            'compress': '📦 Compress PDF',
            'watermark': '💧 Watermark',
            'sign': '✍️ Sign PDF',
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
    
    // Reset form
    resetImageToPdfForm();
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

// Make showToolGrid globally accessible
window.showToolGrid = showToolGrid;
