const express = require('express');
const router = express.Router();
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    const outputDir = req.app.get('outputDir');

    upload.fields([
        { name: 'pdf', maxCount: 1 },
        { name: 'signatureImage', maxCount: 1 }
    ])(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }

        if (!req.files || !req.files.pdf || req.files.pdf.length === 0) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        try {
            const pdfFile = req.files.pdf[0];
            const pdfBytes = await fs.readFile(pdfFile.path);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            
            const pages = pdfDoc.getPages();
            const pageNumber = parseInt(req.body.pageNumber) || 1;
            
            if (pageNumber < 1 || pageNumber > pages.length) {
                await fs.unlink(pdfFile.path);
                return res.status(400).json({ error: `Invalid page number. PDF has ${pages.length} pages.` });
            }
            
            const page = pages[pageNumber - 1];
            const { width, height } = page.getSize();
            
            let signatureImage;
            
            // Check for drawn signature (base64 data URL)
            if (req.body.signatureData) {
                // Parse base64 data URL
                const base64Data = req.body.signatureData.replace(/^data:image\/\w+;base64,/, '');
                const signatureBuffer = Buffer.from(base64Data, 'base64');
                
                // Convert to PNG with transparency preserved
                const pngBuffer = await sharp(signatureBuffer)
                    .png()
                    .toBuffer();
                
                signatureImage = await pdfDoc.embedPng(pngBuffer);
            }
            // Check for uploaded signature image
            else if (req.files.signatureImage && req.files.signatureImage.length > 0) {
                const sigFile = req.files.signatureImage[0];
                const sigBytes = await fs.readFile(sigFile.path);
                
                // Convert to PNG for consistency
                const pngBuffer = await sharp(sigBytes).png().toBuffer();
                signatureImage = await pdfDoc.embedPng(pngBuffer);
                
                await fs.unlink(sigFile.path);
            }
            else {
                await fs.unlink(pdfFile.path);
                return res.status(400).json({ error: 'No signature provided' });
            }
            
            // Position parameters (as percentages)
            const sigX = parseFloat(req.body.signatureX) || 70;
            const sigY = parseFloat(req.body.signatureY) || 90;
            const sigScale = parseFloat(req.body.signatureScale) || 100;
            
            // Calculate signature dimensions
            const scaleFactor = sigScale / 100;
            const maxWidth = 200 * scaleFactor;
            const aspectRatio = signatureImage.height / signatureImage.width;
            const sigWidth = maxWidth;
            const sigHeight = maxWidth * aspectRatio;
            
            // Convert percentage to actual coordinates
            const actualX = (sigX / 100) * width - (sigWidth / 2);
            const actualY = height - ((sigY / 100) * height) - (sigHeight / 2);
            
            // Draw signature on page
            page.drawImage(signatureImage, {
                x: actualX,
                y: actualY,
                width: sigWidth,
                height: sigHeight
            });
            
            // Save the signed PDF
            const signedPdfBytes = await pdfDoc.save();
            
            let baseFilename = req.body.outputFilename || 'signed-document';
            baseFilename = baseFilename.replace(/[^a-zA-Z0-9-_\s]/g, '').trim() || 'signed-document';
            const outputFilename = `${baseFilename}-${uuidv4().slice(0, 8)}.pdf`;
            const outputPath = path.join(outputDir, outputFilename);
            
            await fs.writeFile(outputPath, signedPdfBytes);
            await fs.unlink(pdfFile.path);
            
            res.json({
                success: true,
                message: 'PDF signed successfully',
                downloadUrl: `/download/${outputFilename}`,
                filename: outputFilename
            });
            
        } catch (error) {
            console.error('Error signing PDF:', error);
            res.status(500).json({ error: 'Failed to sign PDF: ' + error.message });
        }
    });
});

module.exports = router;
