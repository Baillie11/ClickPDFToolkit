const express = require('express');
const router = express.Router();
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
const { number, IMAGE_OPTIONS } = require('../lib/security');

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    const saveOutput = req.app.get('saveOutput');

    upload.fields([
        { name: 'pdf', maxCount: 1 },
        { name: 'overlayImage', maxCount: 1 }
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
            
            // Get edit parameters
            const pageNumber = number(req.body, 'pageNumber', 1, 1, 10000, true);
            const pages = pdfDoc.getPages();
            
            if (pageNumber < 1 || pageNumber > pages.length) {
                await fs.unlink(pdfFile.path);
                return res.status(400).json({ error: `Invalid page number. PDF has ${pages.length} pages.` });
            }
            
            const page = pages[pageNumber - 1];
            const { width, height } = page.getSize();
            
            // Add text if provided
            if (req.body.text && req.body.text.trim()) {
                const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                const fontSize = number(req.body, 'fontSize', 12, 8, 72, true);
                const textX = number(req.body, 'textX', 50, 0, 100, false);
                const textY = number(req.body, 'textY', 50, 0, 100, false);
                
                // Parse color (hex to rgb)
                let textColor = rgb(0, 0, 0);
                if (req.body.textColor) {
                    const hex = req.body.textColor.replace('#', '');
                    const r = parseInt(hex.substring(0, 2), 16) / 255;
                    const g = parseInt(hex.substring(2, 4), 16) / 255;
                    const b = parseInt(hex.substring(4, 6), 16) / 255;
                    textColor = rgb(r, g, b);
                }
                
                // Convert percentage to actual coordinates
                const actualX = (textX / 100) * width;
                const actualY = height - ((textY / 100) * height);
                
                page.drawText(req.body.text, {
                    x: actualX,
                    y: actualY,
                    size: fontSize,
                    font: font,
                    color: textColor
                });
            }
            
            // Add image if provided
            if (req.files.overlayImage && req.files.overlayImage.length > 0) {
                const imageFile = req.files.overlayImage[0];
                const imageBytes = await fs.readFile(imageFile.path);
                
                let image;
                if (imageFile.mimetype === 'image/png') {
                    image = await pdfDoc.embedPng(imageBytes);
                } else if (imageFile.mimetype === 'image/jpeg' || imageFile.mimetype === 'image/jpg') {
                    image = await pdfDoc.embedJpg(imageBytes);
                } else {
                    // Try to convert using sharp if available
                    const sharp = require('sharp');
                    const pngBuffer = await sharp(imageBytes, IMAGE_OPTIONS).png().toBuffer();
                    image = await pdfDoc.embedPng(pngBuffer);
                }
                
                const imageX = number(req.body, 'imageX', 50, 0, 100, false);
                const imageY = number(req.body, 'imageY', 50, 0, 100, false);
                const imageScale = number(req.body, 'imageScale', 100, 10, 200, false);
                
                const scaleFactor = imageScale / 100;
                const imgWidth = image.width * scaleFactor * 0.5;
                const imgHeight = image.height * scaleFactor * 0.5;
                
                const actualX = (imageX / 100) * width - (imgWidth / 2);
                const actualY = height - ((imageY / 100) * height) - (imgHeight / 2);
                
                page.drawImage(image, {
                    x: actualX,
                    y: actualY,
                    width: imgWidth,
                    height: imgHeight
                });
                
                await fs.unlink(imageFile.path);
            }
            
            // Save the edited PDF
            const editedPdfBytes = await pdfDoc.save();
            
            const outputFilename = await saveOutput(req, editedPdfBytes, req.body.outputFilename, 'edited-pdf');

            res.json({
                success: true,
                message: 'PDF edited successfully',
                downloadUrl: `/download/${encodeURIComponent(outputFilename)}`,
                filename: outputFilename
            });
            
        } catch (error) {
            console.error('Document processing failed');
            res.status(400).json({ error: 'Failed to edit PDF; check the document and settings' });
        }
    });
});

module.exports = router;
