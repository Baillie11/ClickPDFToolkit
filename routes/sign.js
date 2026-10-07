const express = require('express');
const router = express.Router();
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const { number, IMAGE_OPTIONS } = require('../lib/security');
const sharp = require('sharp');

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    const saveOutput = req.app.get('saveOutput');

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
            const pageNumber = number(req.body, 'pageNumber', 1, 1, 10000, true);
            
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
                const pngBuffer = await sharp(signatureBuffer, IMAGE_OPTIONS)
                    .png()
                    .toBuffer();
                
                signatureImage = await pdfDoc.embedPng(pngBuffer);
            }
            // Check for uploaded signature image
            else if (req.files.signatureImage && req.files.signatureImage.length > 0) {
                const sigFile = req.files.signatureImage[0];
                const sigBytes = await fs.readFile(sigFile.path);
                
                // Convert to PNG for consistency
                const pngBuffer = await sharp(sigBytes, IMAGE_OPTIONS).png().toBuffer();
                signatureImage = await pdfDoc.embedPng(pngBuffer);
                
                await fs.unlink(sigFile.path);
            }
            else {
                await fs.unlink(pdfFile.path);
                return res.status(400).json({ error: 'No signature provided' });
            }
            
            // Position parameters (as percentages)
            const sigX = number(req.body, 'signatureX', 70, 0, 100, false);
            const sigY = number(req.body, 'signatureY', 90, 0, 100, false);
            const sigScale = number(req.body, 'signatureScale', 100, 10, 200, false);
            
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
            
            const outputFilename = await saveOutput(req, signedPdfBytes, req.body.outputFilename, 'signed-document');

            res.json({
                success: true,
                message: 'PDF signed successfully',
                downloadUrl: `/download/${encodeURIComponent(outputFilename)}`,
                filename: outputFilename
            });
            
        } catch (error) {
            console.error('Document processing failed');
            res.status(400).json({ error: 'Failed to sign PDF; check the document and settings' });
        }
    });
});

module.exports = router;
