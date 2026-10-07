const express = require('express');
const router = express.Router();
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const fs = require('fs').promises;
const { number, IMAGE_OPTIONS } = require('../lib/security');

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    const saveOutput = req.app.get('saveOutput');

    upload.array('images', 50)(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No images uploaded' });
        }

        try {
            const pdfDoc = await PDFDocument.create();
            
            // Get options from request
            const pageSize = req.body.pageSize || 'A4';
            const orientation = req.body.orientation || 'portrait';
            const margin = number(req.body, 'margin', 20, 0, 100, true);
            const fitMode = req.body.fitMode || 'fit'; // fit, fill, stretch

            // Page dimensions in points (72 points = 1 inch)
            const pageSizes = {
                'A4': { width: 595, height: 842 },
                'Letter': { width: 612, height: 792 },
                'Legal': { width: 612, height: 1008 },
                'A3': { width: 842, height: 1191 },
                'A5': { width: 420, height: 595 }
            };

            let { width: pageWidth, height: pageHeight } = pageSizes[pageSize] || pageSizes['A4'];
            
            if (orientation === 'landscape') {
                [pageWidth, pageHeight] = [pageHeight, pageWidth];
            }

            const contentWidth = pageWidth - (margin * 2);
            const contentHeight = pageHeight - (margin * 2);

            for (const file of req.files) {
                try {
                    // Read and process image with sharp
                    const imageBuffer = await fs.readFile(file.path);

                    // Convert to PNG for consistency (pdf-lib works well with PNG)
                    const processedBuffer = await sharp(imageBuffer, IMAGE_OPTIONS)
                        .png()
                        .toBuffer();

                    // Embed image in PDF
                    const image = await pdfDoc.embedPng(processedBuffer);
                    const imgWidth = image.width;
                    const imgHeight = image.height;

                    // Calculate dimensions based on fit mode
                    let drawWidth, drawHeight, x, y;

                    if (fitMode === 'stretch') {
                        drawWidth = contentWidth;
                        drawHeight = contentHeight;
                    } else if (fitMode === 'fill') {
                        const scaleX = contentWidth / imgWidth;
                        const scaleY = contentHeight / imgHeight;
                        const scale = Math.max(scaleX, scaleY);
                        drawWidth = imgWidth * scale;
                        drawHeight = imgHeight * scale;
                    } else { // fit (default)
                        const scaleX = contentWidth / imgWidth;
                        const scaleY = contentHeight / imgHeight;
                        const scale = Math.min(scaleX, scaleY);
                        drawWidth = imgWidth * scale;
                        drawHeight = imgHeight * scale;
                    }

                    // Center the image
                    x = margin + (contentWidth - drawWidth) / 2;
                    y = margin + (contentHeight - drawHeight) / 2;

                    // Add page and draw image
                    const page = pdfDoc.addPage([pageWidth, pageHeight]);
                    page.drawImage(image, {
                        x,
                        y,
                        width: drawWidth,
                        height: drawHeight
                    });

                    // Clean up uploaded file
                    await fs.unlink(file.path);
                } catch (imgError) {
                    console.error('Image processing failed');
                    // Continue with other images
                }
            }

            if (pdfDoc.getPageCount() === 0) {
                return res.status(400).json({ error: 'No valid images could be processed' });
            }

            // Save PDF
            const pdfBytes = await pdfDoc.save();
            
            // Use custom filename or generate one
            const outputFilename = await saveOutput(req, pdfBytes, req.body.outputFilename, 'images-to-pdf');

            res.json({
                success: true,
                message: `Successfully converted ${pdfDoc.getPageCount()} image(s) to PDF`,
                downloadUrl: `/download/${encodeURIComponent(outputFilename)}`,
                filename: outputFilename,
                pageCount: pdfDoc.getPageCount()
            });

        } catch (error) {
            console.error('Document processing failed');
            res.status(400).json({ error: 'Failed to convert images to PDF; check the document and settings' });
        }
    });
});

module.exports = router;
