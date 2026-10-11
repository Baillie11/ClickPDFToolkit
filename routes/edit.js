const express = require('express');
const router = express.Router();
const { PDFDocument, rgb, StandardFonts, LineCapStyle } = require('pdf-lib');
const fs = require('fs').promises;
const sharp = require('sharp');
const { number, IMAGE_OPTIONS, validateImage } = require('../lib/security');

// Bounds keep a single request from consuming unbounded CPU or memory. The upload layer already
// limits each multipart field to 1 MiB and requires every field to be a string.
const MAX_ITEMS = 200;
const MAX_STROKES = 200;
const MAX_STROKE_POINTS = 20000;
const MAX_TEXT_LENGTH = 10000;
const DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
// Helvetica cannot encode these; ZapfDingbats supplies the heavy check/ballot-X glyphs (pdf-lib maps by Unicode).
const SYMBOLS = { '\u2713': '\u2714', '\u2717': '\u2718' };

function invalid(message) {
    return Object.assign(new Error(message), { status: 400 });
}

function parseList(body, name, max = MAX_ITEMS) {
    if (body[name] === undefined || body[name] === '') return [];
    let value;
    try {
        value = JSON.parse(body[name]);
    } catch {
        throw invalid(`Invalid ${name}`);
    }
    if (!Array.isArray(value) || value.length > max || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw invalid(`Invalid ${name}`);
    }
    return value;
}

function finite(value, name, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw invalid(`Invalid ${name}`);
    return value;
}

function text(value, name) {
    if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) throw invalid(`Invalid ${name}`);
    return value;
}

function color(value) {
    if (value === undefined) return rgb(0, 0, 0);
    if (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value)) throw invalid('Invalid color');
    return rgb(
        parseInt(value.slice(1, 3), 16) / 255,
        parseInt(value.slice(3, 5), 16) / 255,
        parseInt(value.slice(5, 7), 16) / 255
    );
}

function pageAt(pages, value) {
    if (!Number.isInteger(value) || value < 1 || value > pages.length) throw invalid('Invalid page');
    return pages[value - 1];
}

// Standard fonts only encode a limited character set; substitute '?' rather than failing the request.
function encodable(font, value) {
    const supported = new Set(font.getCharacterSet());
    return [...value.replace(/\t/g, ' ')].map(char => (supported.has(char.codePointAt(0)) ? char : '?')).join('');
}

async function embedDataUrl(pdfDoc, cache, dataUrl) {
    if (typeof dataUrl !== 'string' || !DATA_URL_PATTERN.test(dataUrl)) throw invalid('Invalid image');
    if (cache.has(dataUrl)) return cache.get(dataUrl);
    const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    await validateImage(buffer);
    const embedded = await pdfDoc.embedPng(await sharp(buffer, IMAGE_OPTIONS).png().toBuffer());
    cache.set(dataUrl, embedded);
    return embedded;
}

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
            const pages = pdfDoc.getPages();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const symbolFont = await pdfDoc.embedFont(StandardFonts.ZapfDingbats);
            const images = new Map();

            // Validate the whole request before drawing anything.
            const pageNumber = number(req.body, 'pageNumber', 1, 1, 10000, true);
            if (pageNumber > pages.length) {
                return res.status(400).json({ error: `Invalid page number. PDF has ${pages.length} pages.` });
            }
            const textEdits = parseList(req.body, 'textEdits');
            const annotations = parseList(req.body, 'annotations');
            const signatures = parseList(req.body, 'signatures');
            const rectangles = parseList(req.body, 'rectangles');
            const strokes = parseList(req.body, 'drawStrokes', MAX_STROKES);

            // Edit existing text: white out the original line, then draw the replacement.
            for (const edit of textEdits) {
                const page = pageAt(pages, edit.page);
                const fontSize = finite(edit.fontSize, 'fontSize', 1, 500);
                const pdfX = finite(edit.pdfX, 'pdfX', -10000, 100000);
                const pdfY = finite(edit.pdfY, 'pdfY', -10000, 100000);
                const pdfWidth = finite(edit.pdfWidth, 'pdfWidth', 0, 100000);
                const newText = text(edit.newText, 'newText');
                const textColor = color(edit.color);

                page.drawRectangle({
                    x: pdfX - 1,
                    y: pdfY - fontSize * 0.3,
                    width: pdfWidth + 2,
                    height: fontSize * 1.3,
                    color: rgb(1, 1, 1),
                    borderWidth: 0
                });
                if (newText.trim()) {
                    page.drawText(encodable(font, newText), { x: pdfX, y: pdfY, size: fontSize, font, color: textColor });
                }
            }

            // Text annotations (x/y are the top-left of the field as a percentage of the page).
            for (const ann of annotations) {
                const page = pageAt(pages, ann.page);
                const { width, height } = page.getSize();
                const fontSize = finite(ann.fontSize, 'fontSize', 6, 72);
                const x = finite(ann.x, 'x', -100, 200);
                const y = finite(ann.y, 'y', -100, 200);
                const content = text(ann.text, 'text');
                const textColor = color(ann.color);

                // drawText uses the baseline, so offset down from the text top.
                const actualX = (x / 100) * width;
                const baselineY = height - ((y / 100) * height) - fontSize * 0.82;

                if (SYMBOLS[content]) {
                    page.drawText(SYMBOLS[content], { x: actualX, y: baselineY, size: fontSize, font: symbolFont, color: textColor });
                    continue;
                }
                content.split('\n').forEach((line, index) => {
                    page.drawText(encodable(font, line), {
                        x: actualX,
                        y: baselineY - (index * fontSize * 1.2),
                        size: fontSize,
                        font,
                        color: textColor
                    });
                });
            }

            // Signature and image placements (percent of page; x/y is the top-left corner).
            for (const sig of signatures) {
                const page = pageAt(pages, sig.page);
                const { width, height } = page.getSize();
                const x = finite(sig.x, 'x', -100, 200);
                const y = finite(sig.y, 'y', -100, 200);
                const w = finite(sig.widthPct, 'widthPct', 0.1, 200);
                const h = finite(sig.heightPct, 'heightPct', 0.1, 200);
                const embedded = await embedDataUrl(pdfDoc, images, sig.imageData);

                const sigH = (h / 100) * height;
                page.drawImage(embedded, {
                    x: (x / 100) * width,
                    y: height - ((y / 100) * height) - sigH,
                    width: (w / 100) * width,
                    height: sigH
                });
            }

            // Highlight / whiteout rectangles.
            for (const rect of rectangles) {
                const page = pageAt(pages, rect.page);
                const { width, height } = page.getSize();
                if (!['highlight', 'whiteout'].includes(rect.type)) throw invalid('Invalid rectangle type');
                const x = finite(rect.x, 'x', -100, 200);
                const y = finite(rect.y, 'y', -100, 200);
                const w = finite(rect.w, 'w', 0, 300);
                const h = finite(rect.h, 'h', 0, 300);
                const opacity = finite(rect.opacity, 'opacity', 1, 100) / 100;

                const rectHeight = (h / 100) * height;
                page.drawRectangle({
                    x: (x / 100) * width,
                    y: height - ((y / 100) * height) - rectHeight,
                    width: (w / 100) * width,
                    height: rectHeight,
                    color: color(rect.color),
                    opacity,
                    borderWidth: 0
                });
            }

            // Freehand strokes are drawn as vector line segments (thickness in PDF points).
            let totalPoints = 0;
            for (const stroke of strokes) {
                const page = pageAt(pages, stroke.page);
                const { width, height } = page.getSize();
                const thickness = finite(stroke.size, 'size', 1, 50);
                const strokeColor = color(stroke.color);
                if (!Array.isArray(stroke.points) || stroke.points.length < 2) throw invalid('Invalid points');
                totalPoints += stroke.points.length;
                if (stroke.points.length > MAX_STROKE_POINTS || totalPoints > MAX_STROKE_POINTS) throw invalid('Too many points');
                const points = stroke.points.map(point => {
                    if (!Array.isArray(point) || point.length !== 2) throw invalid('Invalid points');
                    return {
                        x: (finite(point[0], 'x', -100, 200) / 100) * width,
                        y: height - ((finite(point[1], 'y', -100, 200) / 100) * height)
                    };
                });
                for (let i = 1; i < points.length; i++) {
                    page.drawLine({ start: points[i - 1], end: points[i], thickness, color: strokeColor, lineCap: LineCapStyle.Round });
                }
            }

            // Single text field (API compatibility).
            if (!annotations.length && req.body.text && req.body.text.trim()) {
                const page = pages[pageNumber - 1];
                const { width, height } = page.getSize();
                const fontSize = number(req.body, 'fontSize', 12, 8, 72, true);
                const textX = number(req.body, 'textX', 50, 0, 100, false);
                const textY = number(req.body, 'textY', 50, 0, 100, false);

                page.drawText(encodable(font, req.body.text), {
                    x: (textX / 100) * width,
                    y: height - ((textY / 100) * height),
                    size: fontSize,
                    font,
                    color: color(req.body.textColor)
                });
            }

            // Single overlay image (API compatibility).
            if (req.files.overlayImage && req.files.overlayImage.length > 0) {
                const imageFile = req.files.overlayImage[0];
                const imageBytes = await fs.readFile(imageFile.path);

                let image;
                if (imageFile.mimetype === 'image/png') {
                    image = await pdfDoc.embedPng(imageBytes);
                } else if (imageFile.mimetype === 'image/jpeg' || imageFile.mimetype === 'image/jpg') {
                    image = await pdfDoc.embedJpg(imageBytes);
                } else {
                    image = await pdfDoc.embedPng(await sharp(imageBytes, IMAGE_OPTIONS).png().toBuffer());
                }

                const page = pages[pageNumber - 1];
                const { width, height } = page.getSize();
                const imageX = number(req.body, 'imageX', 50, 0, 100, false);
                const imageY = number(req.body, 'imageY', 50, 0, 100, false);
                const imageScale = number(req.body, 'imageScale', 100, 10, 200, false);

                const scaleFactor = imageScale / 100;
                const imgWidth = image.width * scaleFactor * 0.5;
                const imgHeight = image.height * scaleFactor * 0.5;

                page.drawImage(image, {
                    x: (imageX / 100) * width - (imgWidth / 2),
                    y: height - ((imageY / 100) * height) - (imgHeight / 2),
                    width: imgWidth,
                    height: imgHeight
                });
            }

            // Save the edited PDF
            const editedPdfBytes = await pdfDoc.save();
            const outputFilename = await saveOutput(req, editedPdfBytes, req.body.outputFilename, 'edited-pdf');

            res.json({
                success: true,
                message: 'PDF edited successfully',
                downloadUrl: `${req.app.get('basePath')}/download/${encodeURIComponent(outputFilename)}`,
                filename: outputFilename
            });

        } catch (error) {
            console.error('Document processing failed');
            res.status(400).json({ error: 'Failed to edit PDF; check the document and settings' });
        }
    });
});

module.exports = router;
