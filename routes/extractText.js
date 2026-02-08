const express = require('express');
const router = express.Router();

// TODO: Implement text extraction functionality
// Will extract text content from PDFs

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    
    upload.single('pdf')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }

        // TODO: Implement text extraction logic
        res.status(501).json({ 
            error: 'Not implemented yet',
            message: 'Extract text functionality coming soon'
        });
    });
});

module.exports = router;
