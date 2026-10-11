const express = require('express');
const router = express.Router();
const { PDFDocument } = require('pdf-lib');
const fs = require('node:fs/promises');
const MAX_PAGES = 1000;

router.post('/', (req, res) => {
    const upload = req.app.get('upload');
    upload.array('pdfs', 50)(req, res, async () => {
        if (!req.files || req.files.length < 2) {
            return res.status(400).json({ error: 'Choose at least two PDF files to merge.' });
        }
        const merged = await PDFDocument.create();
        let pageCount = 0;
        let flattenedFormCount = 0;
        // Multipart order is the requested document order. Never silently skip a file.
        for (let index = 0; index < req.files.length; index++) {
            try {
                const source = await PDFDocument.load(await fs.readFile(req.files[index].path), { updateMetadata: false });
                const count = source.getPageCount();
                if (count === 0) return res.status(400).json({ error: `PDF ${index + 1} has no pages.` });
                if (pageCount + count > MAX_PAGES) return res.status(400).json({ error: `A merge can contain at most ${MAX_PAGES} pages. Use fewer documents.` });
                // Widget names may collide across documents. Preserve their visible values
                // as page content rather than producing broken interactive fields.
                if (source.getForm().getFields().length > 0) {
                    source.getForm().flatten();
                    flattenedFormCount++;
                }
                const pages = await merged.copyPages(source, source.getPageIndices());
                pages.forEach(page => merged.addPage(page));
                pageCount += count;
            } catch {
                return res.status(400).json({ error: `PDF ${index + 1} could not be merged. Use a valid, unencrypted PDF; export complex forms as a flattened PDF first.` });
            }
        }
        try {
            merged.setCreator('ClickPDF Toolkit');
            merged.setProducer('ClickPDF Toolkit');
            const filename = await req.app.get('saveOutput')(req, await merged.save(), req.body.outputFilename, 'merged-document');
            res.json({
                success: true,
                message: `Merged ${req.files.length} PDFs into ${pageCount} pages.`,
                filename,
                downloadUrl: `${req.app.get('basePath')}/download/${encodeURIComponent(filename)}`,
                fileCount: req.files.length,
                pageCount,
                flattenedFormCount
            });
        } catch {
            res.status(500).json({ error: 'The merged PDF could not be saved. Try again later.' });
        }
    });
});

module.exports = router;
