const express = require('express');
const router = express.Router();
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    const outputDir = req.app.get('outputDir');

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
            const margin = parseInt(req.body.margin) || 20;
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
                    const metadata = await sharp(imageBuffer).metadata();

                    // Convert to PNG for consistency (pdf-lib works well with PNG)
                    const processedBuffer = await sharp(imageBuffer)
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
                    console.error(`Error processing image ${file.originalname}:`, imgError);
                    // Continue with other images
                }
            }

            if (pdfDoc.getPageCount() === 0) {
                return res.status(400).json({ error: 'No valid images could be processed' });
            }

            // Save PDF
            const pdfBytes = await pdfDoc.save();
            
            // Use custom filename or generate one
            let baseFilename = req.body.outputFilename || 'images-to-pdf';
            // Sanitize filename (remove invalid characters)
            baseFilename = baseFilename.replace(/[^a-zA-Z0-9-_\s]/g, '').trim() || 'images-to-pdf';
            const outputFilename = `${baseFilename}-${uuidv4().slice(0, 8)}.pdf`;
            const outputPath = path.join(outputDir, outputFilename);
            await fs.writeFile(outputPath, pdfBytes);

            res.json({
                success: true,
                message: `Successfully converted ${pdfDoc.getPageCount()} image(s) to PDF`,
                downloadUrl: `/download/${outputFilename}`,
                filename: outputFilename,
                pageCount: pdfDoc.getPageCount()
            });

        } catch (error) {
            console.error('Error converting images to PDF:', error);
            res.status(500).json({ error: 'Failed to convert images to PDF: ' + error.message });
        }
    });
});

module.exports = router;
