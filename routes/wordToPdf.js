const express = require('express');
const router = express.Router();

// TODO: Implement Word to PDF conversion
// Will convert .doc/.docx files to PDF format

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    
    upload.single('document')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }

        // TODO: Implement Word to PDF conversion
        res.status(501).json({ 
            error: 'Not implemented yet',
            message: 'Word to PDF conversion coming soon'
        });
    });
});

module.exports = router;
