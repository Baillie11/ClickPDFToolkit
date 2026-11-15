const router = require('express').Router();
const { PDFDocument } = require('pdf-lib');
const fs = require('node:fs/promises');
router.post('/', (req, res) => {
    req.app.get('upload').array('pdf', 1)(req, res, async () => {
        if (req.files?.length !== 1) return res.status(400).json({ error: 'Choose one PDF to reorder.' });
        let source, order;
        try { source = await PDFDocument.load(await fs.readFile(req.files[0].path), { updateMetadata: false }); }
        catch { return res.status(400).json({ error: 'Use a valid, unencrypted PDF.' }); }
        const count = source.getPageCount();
        try { order = JSON.parse(req.body.order); } catch {}
        if (count < 1 || count > 1000 || !Array.isArray(order) || order.length !== count || new Set(order).size !== count || order.some(page => !Number.isInteger(page) || page < 1 || page > count)) {
            return res.status(400).json({ error: 'Include every page exactly once, using page numbers from 1 to the page count (maximum 1,000 pages).' });
        }
        let filename;
        try {
            const flattenedForms = source.getForm().getFields().length > 0;
            if (flattenedForms) source.getForm().flatten();
            const output = await PDFDocument.create();
            (await output.copyPages(source, order.map(page => page - 1))).forEach(page => output.addPage(page));
            output.setCreator('ClickPDF Toolkit');
            output.setProducer('ClickPDF Toolkit');
            const bytes = await output.save();
            if (bytes.length > 100 * 1024 * 1024 || req.aborted || res.destroyed) throw new Error('Output unavailable');
            filename = await req.app.get('saveOutput')(req, bytes, req.body.outputFilename || 'reordered-document', 'reordered-document');
            if (req.aborted || res.destroyed) throw new Error('Aborted');
            res.json({ success: true, message: `Reordered ${count} page${count === 1 ? '' : 's'}.`, pageCount: count, flattenedForms, filename, downloadUrl: `${req.app.get('basePath')}/download/${encodeURIComponent(filename)}` });
        } catch {
            if (filename) await req.app.get('discardOutput')(req, filename);
            if (!res.destroyed) res.status(400).json({ error: 'Could not reorder this PDF. Try a flattened document; output must fit within 100 MiB and available storage.' });
        }
    });
});
module.exports = router;
