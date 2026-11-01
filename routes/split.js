const router = require('express').Router();
const { PDFDocument } = require('pdf-lib');
const fs = require('node:fs/promises');
const { pageGroups } = require('../public/js/pageSelection');

router.post('/', (req, res) => {
    req.app.get('upload').array('pdf', 1)(req, res, async () => {
        if (req.files?.length !== 1) return res.status(400).json({ error: 'Choose one PDF to split.' });
        let source;
        try {
            source = await PDFDocument.load(await fs.readFile(req.files[0].path), { updateMetadata: false });
        } catch {
            return res.status(400).json({ error: 'Use a valid, unencrypted PDF.' });
        }
        let groups;
        try {
            groups = pageGroups(req.body.mode || 'extract', req.body.pages, source.getPageCount());
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
        const saved = [];
        try {
            const flattenedForms = source.getForm().getFields().length > 0;
            if (flattenedForms) source.getForm().flatten();
            let totalBytes = 0;
            for (const [index, group] of groups.entries()) {
                if (req.aborted || res.destroyed) throw new Error('Aborted');
                const output = await PDFDocument.create();
                (await output.copyPages(source, group)).forEach(page => output.addPage(page));
                output.setCreator('ClickPDF Toolkit');
                output.setProducer('ClickPDF Toolkit');
                const bytes = await output.save();
                totalBytes += bytes.length;
                if (totalBytes > 100 * 1024 * 1024) throw new Error('Output too large');
                const base = req.body.outputFilename || 'split-document';
                const name = groups.length === 1 ? base : `${base.slice(0, 65)}-part-${index + 1}`;
                const filename = await req.app.get('saveOutput')(req, bytes, name, 'split-document');
                saved.push({ filename, pageCount: group.length, pages: group.map(page => page + 1), downloadUrl: `${req.app.get('basePath')}/download/${encodeURIComponent(filename)}` });
            }
            if (req.aborted || res.destroyed) throw new Error('Aborted');
            res.json({ success: true, message: `Created ${saved.length} PDF${saved.length === 1 ? '' : 's'}.`, sourcePageCount: source.getPageCount(), flattenedForms, files: saved });
        } catch {
            await Promise.all(saved.map(file => req.app.get('discardOutput')(req, file.filename)));
            if (!res.destroyed) res.status(400).json({ error: 'Could not split this PDF. Try fewer pages or a flattened document; total output must fit within 100 MiB and available storage.' });
        }
    });
});
module.exports = router;
