const express = require('express');
const router = express.Router();

// TODO: Implement Excel to PDF conversion
// Will convert .xls/.xlsx files to PDF format

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    
    upload.single('spreadsheet')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }

        // TODO: Implement Excel to PDF conversion
        res.status(501).json({ 
            error: 'Not implemented yet',
            message: 'Excel to PDF conversion coming soon'
        });
    });
});

module.exports = router;
