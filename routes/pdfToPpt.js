const express = require('express');
const router = express.Router();

// TODO: Implement PDF to PowerPoint conversion
// Will convert PDF files to .pptx format

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    
    upload.single('pdf')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }

        // TODO: Implement PDF to PowerPoint conversion
        res.status(501).json({ 
            error: 'Not implemented yet',
            message: 'PDF to PowerPoint conversion coming soon'
        });
    });
});

module.exports = router;
