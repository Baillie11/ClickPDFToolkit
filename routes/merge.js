const express = require('express');
const router = express.Router();

// TODO: Implement PDF merge functionality
// Will accept multiple PDF files and combine them into one

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    
    upload.array('pdfs', 50)(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }

        // TODO: Implement merge logic using pdf-lib
        res.status(501).json({ 
            error: 'Not implemented yet',
            message: 'Merge PDF functionality coming soon'
        });
    });
});

module.exports = router;
