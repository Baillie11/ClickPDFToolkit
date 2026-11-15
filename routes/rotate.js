const router = require('express').Router();
const { PDFDocument, degrees } = require('pdf-lib');
const fs = require('node:fs/promises');
router.post('/', (req, res) => {
    req.app.get('upload').array('pdf', 1)(req, res, async () => {
        if (req.files?.length !== 1) return res.status(400).json({ error: 'Choose one PDF to rotate.' });
        let source, rotations;
        try { source = await PDFDocument.load(await fs.readFile(req.files[0].path), { updateMetadata: false }); }
        catch { return res.status(400).json({ error: 'Use a valid, unencrypted PDF.' }); }
        const count = source.getPageCount();
        try { rotations = JSON.parse(req.body.rotations); } catch {}
        if (count < 1 || count > 1000 || !Array.isArray(rotations) || rotations.length !== count ||
            rotations.some(angle => ![0, 90, 180, 270].includes(angle))) {
            return res.status(400).json({ error: 'Provide one rotation (0, 90, 180 or 270 degrees clockwise) for each page, up to 1,000 pages.' });
        }
        let filename;
        try {
            const flattenedForms = source.getForm().getFields().length > 0;
            if (flattenedForms) source.getForm().flatten();
            const output = await PDFDocument.create();
            const pages = await output.copyPages(source, Array.from({ length: count }, (_, index) => index));
            pages.forEach((page, index) => {
                page.setRotation(degrees(((page.getRotation().angle + rotations[index]) % 360 + 360) % 360));
                output.addPage(page);
            });
            output.setCreator('ClickPDF Toolkit');
            output.setProducer('ClickPDF Toolkit');
            const bytes = await output.save();
            if (bytes.length > 100 * 1024 * 1024 || req.aborted || res.destroyed) throw new Error('Output unavailable');
            filename = await req.app.get('saveOutput')(req, bytes, req.body.outputFilename || 'rotated-document', 'rotated-document');
            if (req.aborted || res.destroyed) throw new Error('Aborted');
            const changed = rotations.filter(angle => angle !== 0).length;
            res.json({ success: true, message: `Rotated ${changed} page${changed === 1 ? '' : 's'}.`, pageCount: count, flattenedForms, filename, downloadUrl: `${req.app.get('basePath')}/download/${encodeURIComponent(filename)}` });
        } catch {
            if (filename) await req.app.get('discardOutput')(req, filename);
            if (!res.destroyed) res.status(400).json({ error: 'Could not rotate this PDF. Try a flattened document; output must fit within 100 MiB and available storage.' });
        }
    });
});
module.exports = router;
