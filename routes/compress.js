const router = require('express').Router();
const fs = require('node:fs/promises');
const { compressPdf } = require('../lib/compress');
router.post('/', (req, res) => {
    req.app.get('upload').array('pdf', 1)(req, res, async () => {
        const preset = req.body.preset || 'balanced';
        const targetMB = req.body.targetMB ? Number(req.body.targetMB) : null;
        if (!['quality', 'balanced', 'smallest'].includes(preset) || (targetMB !== null && (!Number.isFinite(targetMB) || targetMB < 0.1 || targetMB > 50))) {
            return res.status(400).json({ error: 'Choose a compression preset and a target between 0.1 and 50 MB.' });
        }
        if ((req.files?.length || 0) + (req.body.sourceFilename ? 1 : 0) !== 1) return res.status(400).json({ error: 'Choose one PDF to compress.' });
        const controller = new AbortController();
        const cancel = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', cancel);
        let filename;
        try {
            const bytes = req.body.sourceFilename
                ? await req.app.get('readOutput')(req, req.body.sourceFilename)
                : await fs.readFile(req.files[0].path);
            if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error('Choose a PDF no larger than 50 MiB.');
            const targetBytes = targetMB === null ? null : Math.floor(targetMB * 1_000_000);
            const result = await compressPdf(bytes, preset, targetBytes, controller.signal);
            if (controller.signal.aborted) return;
            filename = await req.app.get('saveOutput')(req, result.bytes, req.body.outputFilename || 'compressed-document', 'compressed-document');
            if (controller.signal.aborted) { await req.app.get('discardOutput')(req, filename); return; }
            const savedBytes = bytes.length - result.bytes.length;
            res.json({ success: true, filename, downloadUrl: `${req.app.get('basePath')}/download/${encodeURIComponent(filename)}`,
                originalBytes: bytes.length, outputBytes: result.bytes.length, savedBytes,
                savedPercent: Number((100 * savedBytes / bytes.length).toFixed(1)),
                targetBytes, targetMet: targetBytes === null ? null : result.bytes.length <= targetBytes,
                pageCount: result.pageCount, optimisedImages: result.optimisedImages, presetUsed: result.presetUsed,
                unchanged: savedBytes === 0,
                message: savedBytes ? 'Your smaller PDF is ready. Review image quality before sharing.' : 'No smaller version was found. Your original PDF is available unchanged.' });
        } catch (error) {
            if (filename) await req.app.get('discardOutput')(req, filename);
            if (!res.destroyed) res.status(400).json({ error: error.message || 'Could not compress this PDF.' });
        } finally { res.removeListener('close', cancel); }
    });
});
module.exports = router;
