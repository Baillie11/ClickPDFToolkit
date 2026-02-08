const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Import route handlers
const mergeRoutes = require('./routes/merge');
const splitRoutes = require('./routes/split');
const compressRoutes = require('./routes/compress');
const pdfToWordRoutes = require('./routes/pdfToWord');
const wordToPdfRoutes = require('./routes/wordToPdf');
const pdfToPptRoutes = require('./routes/pdfToPpt');
const pptToPdfRoutes = require('./routes/pptToPdf');
const pdfToExcelRoutes = require('./routes/pdfToExcel');
const excelToPdfRoutes = require('./routes/excelToPdf');
const editRoutes = require('./routes/edit');
const pdfToImageRoutes = require('./routes/pdfToImage');
const imageToPdfRoutes = require('./routes/imageToPdf');
const signRoutes = require('./routes/sign');
const watermarkRoutes = require('./routes/watermark');
const rotateRoutes = require('./routes/rotate');
const htmlToPdfRoutes = require('./routes/htmlToPdf');
const unlockRoutes = require('./routes/unlock');
const protectRoutes = require('./routes/protect');
const ocrRoutes = require('./routes/ocr');
const extractTextRoutes = require('./routes/extractText');
const reorderRoutes = require('./routes/reorder');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure upload and output directories exist
const uploadDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Make upload middleware available to routes
app.set('upload', upload);
app.set('uploadDir', uploadDir);
app.set('outputDir', outputDir);

// Routes
app.use('/api/merge', mergeRoutes);
app.use('/api/split', splitRoutes);
app.use('/api/compress', compressRoutes);
app.use('/api/pdf-to-word', pdfToWordRoutes);
app.use('/api/word-to-pdf', wordToPdfRoutes);
app.use('/api/pdf-to-ppt', pdfToPptRoutes);
app.use('/api/ppt-to-pdf', pptToPdfRoutes);
app.use('/api/pdf-to-excel', pdfToExcelRoutes);
app.use('/api/excel-to-pdf', excelToPdfRoutes);
app.use('/api/edit', editRoutes);
app.use('/api/pdf-to-image', pdfToImageRoutes);
app.use('/api/image-to-pdf', imageToPdfRoutes);
app.use('/api/sign', signRoutes);
app.use('/api/watermark', watermarkRoutes);
app.use('/api/rotate', rotateRoutes);
app.use('/api/html-to-pdf', htmlToPdfRoutes);
app.use('/api/unlock', unlockRoutes);
app.use('/api/protect', protectRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/extract-text', extractTextRoutes);
app.use('/api/reorder', reorderRoutes);

// Serve output files for download
app.use('/download', express.static(outputDir));

// Cleanup old files periodically (every hour)
setInterval(() => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    [uploadDir, outputDir].forEach(dir => {
        fs.readdir(dir, (err, files) => {
            if (err) return;
            files.forEach(file => {
                const filePath = path.join(dir, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) return;
                    if (now - stats.mtimeMs > maxAge) {
                        fs.unlink(filePath, () => {});
                    }
                });
            });
        });
    });
}, 60 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`PDF Toolkit server running on http://localhost:${PORT}`);
});
