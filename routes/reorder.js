const express = require('express');
const router = express.Router();

// TODO: Implement PDF page reordering functionality
// Will allow rearranging pages within a PDF

router.post('/', async (req, res) => {
    const upload = req.app.get('upload');
    
    upload.single('pdf')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }

        // TODO: Implement reorder logic using pdf-lib
        res.status(501).json({ 
            error: 'Not implemented yet',
            message: 'Reorder PDF pages functionality coming soon'
        });
    });
});

module.exports = router;
