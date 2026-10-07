const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { createSecurity } = require('./lib/security');

const placeholders = ['merge', 'split', 'compress', 'pdf-to-word', 'word-to-pdf', 'pdf-to-ppt', 'ppt-to-pdf', 'pdf-to-excel', 'excel-to-pdf', 'pdf-to-image', 'watermark', 'rotate', 'html-to-pdf', 'unlock', 'protect', 'ocr', 'extract-text', 'reorder'];

function createApp(options = {}) {
    const app = express();
    app.disable('x-powered-by');
    const root = options.storageRoot || __dirname;
    for (const [setting, folder] of [['uploadDir', 'uploads'], ['outputDir', 'output']]) {
        const dir = path.join(root, folder);
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        app.set(setting, dir);
    }
    const allowedHosts = new Set(options.allowedHosts || (process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1,[::1]').split(',').map(host => host.trim().toLowerCase()));
    const configuredOrigin = options.publicOrigin || process.env.PUBLIC_ORIGIN;
    let publicOrigin;
    if (configuredOrigin) {
        const parsed = new URL(configuredOrigin);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path');
        publicOrigin = parsed.origin;
    }
    app.set('secureCookies', publicOrigin?.startsWith('https://') || false);
    app.use((req, res, next) => {
        res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
        if (!allowedHosts.has(req.hostname.toLowerCase())) return res.status(403).json({ error: 'Host not allowed' });
        if (req.path.startsWith('/api') || req.path.startsWith('/download')) {
            if (req.get('Sec-Fetch-Site') === 'cross-site') return res.status(403).json({ error: 'Cross-site request rejected' });
            const origin = req.get('Origin');
            if (origin && origin !== (publicOrigin || `${req.protocol}://${req.get('host')}`)) return res.status(403).json({ error: 'Cross-origin request rejected' });
        }
        next();
    });
    app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny', etag: false, maxAge: 0 }));
    const security = createSecurity(app, options);
    app.set('upload', security.upload);
    app.set('saveOutput', security.saveOutput);
    app.use('/api', security.rateLimit);
    // Return 501 before parsing or writing uploads for tools with no processing logic.
    for (const tool of placeholders) app.post(`/api/${tool}`, (req, res) => res.status(501).json({ error: 'Not implemented yet', message: `${tool} functionality coming soon` }));
    app.use('/api', security.session);
    app.use('/api/image-to-pdf', require('./routes/imageToPdf'));
    app.use('/api/edit', require('./routes/edit'));
    app.use('/api/sign', require('./routes/sign'));
    app.get('/download/:filename', security.rateLimit, security.session, security.download);
    app.use((err, req, res, next) => {
        if (res.headersSent) return next(err);
        res.status(400).json({ error: 'Invalid request' });
    });
    const cleanup = () => security.cleanupOldFiles().catch(() => console.error('Periodic cleanup failed'));
    cleanup();
    const timer = setInterval(cleanup, 60 * 1000);
    timer.unref();
    app.set('closeSecurity', () => clearInterval(timer));
    app.set('cleanupFiles', security.cleanupOldFiles);
    return app;
}

if (require.main === module) {
    const app = createApp();
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '127.0.0.1';
    const server = app.listen(port, host, () => console.log(`ClickPDF server listening on ${host}:${port}`));
    server.requestTimeout = 60 * 1000;
    server.headersTimeout = 15 * 1000;
}

module.exports = { createApp };
