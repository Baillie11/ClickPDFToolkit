const express = require('express');
const router = express.Router();

// TODO: Implement PDF to Image conversion
// Will convert PDF pages to image files (PNG, JPG)

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    
    upload.single('pdf')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }

        // TODO: Implement PDF to Image conversion
        res.status(501).json({ 
            error: 'Not implemented yet',
            message: 'PDF to Image conversion coming soon'
        });
    });
});

module.exports = router;
