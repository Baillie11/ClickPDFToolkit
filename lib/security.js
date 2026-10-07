const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Transform, pipeline } = require('node:stream');
const multer = require('multer');
const sharp = require('sharp');

const IMAGE_OPTIONS = { limitInputPixels: 25_000_000 };
const IMAGE_FORMATS = new Set(['jpeg', 'png', 'gif', 'webp', 'tiff', 'avif', 'heif']);

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400 });
}

function number(body, name, fallback, min, max, integer = false) {
    if (body[name] === undefined || body[name] === '') return fallback;
    const value = Number(body[name]);
    if (typeof body[name] !== 'string' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        throw badRequest(`Invalid ${name}`);
    }
    return value;
}

function validateOptions(body) {
    for (const [key, value] of Object.entries(body)) {
        if (typeof value !== 'string') throw badRequest(`Invalid ${key}`);
    }
    for (const key of ['textX', 'textY', 'imageX', 'imageY', 'signatureX', 'signatureY']) number(body, key, 50, 0, 100);
    for (const key of ['imageScale', 'signatureScale']) number(body, key, 100, 10, 200);
    number(body, 'pageNumber', 1, 1, 10_000, true);
    number(body, 'fontSize', 12, 8, 72, true);
    number(body, 'margin', 20, 0, 100, true);
    if (body.textColor && !/^#[a-fA-F0-9]{6}$/.test(body.textColor)) throw badRequest('Invalid textColor');
    for (const [key, choices] of Object.entries({ pageSize: ['A4', 'Letter', 'Legal', 'A3', 'A5'], orientation: ['portrait', 'landscape'], fitMode: ['fit', 'fill', 'stretch'] })) {
        if (body[key] && !choices.includes(body[key])) throw badRequest(`Invalid ${key}`);
    }
    if (body.text && body.text.length > 10_000) throw badRequest('Text is too long');
    if (body.outputFilename && body.outputFilename.length > 100) throw badRequest('Output filename is too long');
}

async function validateImage(buffer) {
    const metadata = await sharp(buffer, IMAGE_OPTIONS).metadata();
    if (!IMAGE_FORMATS.has(metadata.format)) throw badRequest('Unsupported image format');
    return metadata;
}

function createSecurity(app, options = {}) {
    const uploadDir = app.get('uploadDir');
    const outputDir = app.get('outputDir');
    const ttl = options.ttl || 60 * 60 * 1000;
    const sessions = new Map();
    const outputs = new Map();
    const rates = new Map();
    const maxFileSize = options.maxFileSize || 50 * 1024 * 1024;
    const maxTotalSize = options.maxTotalSize || 100 * 1024 * 1024;
    let active = 0;
    let pendingOutputBytes = 0;
    let pendingOutputFiles = 0;

    async function cleanupUploads(req) {
        const results = await Promise.allSettled([...(req.uploadPaths || [])].map(file => fs.promises.rm(file, { force: true })));
        if (results.some(result => result.status === 'rejected')) console.error('Temporary upload cleanup failed');
    }

    const storage = {
        _handleFile(req, file, cb) {
            const filename = crypto.randomUUID();
            const filePath = path.join(uploadDir, filename);
            // Multer can request removal after a limit event even when the write failed.
            file.path = filePath;
            req.uploadPaths.add(filePath);
            let size = 0;
            const counter = new Transform({ transform(chunk, encoding, done) {
                size += chunk.length;
                req.uploadBytes += chunk.length;
                if (req.uploadBytes > maxTotalSize) return done(Object.assign(new Error('Upload total exceeds limit'), { status: 413 }));
                done(null, chunk);
            } });
            pipeline(file.stream, counter, fs.createWriteStream(filePath, { flags: 'wx', mode: 0o600 }), err => {
                if (err) return fs.promises.rm(filePath, { force: true }).then(() => cb(err), () => cb(err));
                cb(null, { destination: uploadDir, filename, path: filePath, size });
            });
        },
        _removeFile(req, file, cb) {
            if (!file.path) return cb(null);
            fs.rm(file.path, { force: true }, cb);
        }
    };
    const parser = multer({ storage, limits: { fileSize: maxFileSize, files: 50, fields: 20, parts: 70, fieldSize: 1024 * 1024, fieldNameSize: 100, fieldNestingDepth: 0, fieldArrayIndexLimit: 0 } });

    function wrap(middleware) {
        return (req, res, callback) => {
            if (active >= (options.maxConcurrent || 2)) return res.status(503).json({ error: 'Server is busy; try again shortly' });
            active++;
            req.uploadPaths = new Set();
            req.uploadBytes = 0;
            middleware(req, res, async err => {
                try {
                    if (err) {
                        const status = err.status || (err.code && err.code.startsWith('LIMIT_') ? 413 : 400);
                        return res.status(status).json({ error: 'Upload rejected: invalid multipart data or upload limit exceeded' });
                    }
                    validateOptions(req.body || {});
                    const files = Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
                    let totalPixels = 0;
                    for (const file of files) {
                        const bytes = await fs.promises.readFile(file.path);
                        if (file.fieldname === 'pdf') {
                            if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw badRequest('Invalid PDF file');
                        } else {
                            try {
                                const metadata = await validateImage(bytes);
                                file.mimetype = `image/${metadata.format}`;
                                totalPixels += metadata.width * metadata.height;
                                if (totalPixels > 50_000_000) throw badRequest('Total image dimensions exceed limit');
                            } catch { throw badRequest('Invalid, unsupported or oversized image'); }
                        }
                    }
                    if (req.body.signatureData) {
                        if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(req.body.signatureData)) throw badRequest('Invalid signature data');
                        try { await validateImage(Buffer.from(req.body.signatureData.split(',')[1], 'base64')); } catch { throw badRequest('Invalid signature image'); }
                    }
                    await callback(null);
                } catch (error) {
                    if (!res.headersSent && !res.destroyed) res.status(error.status || 400).json({ error: error.status ? error.message : 'Invalid uploaded document' });
                } finally {
                    await cleanupUploads(req);
                    active--;
                }
            });
        };
    }

    const upload = { array: (...args) => wrap(parser.array(...args)), fields: (...args) => wrap(parser.fields(...args)) };

    function session(req, res, next) {
        const now = Date.now();
        const supplied = /(?:^|;\s*)clickpdf_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
        if (supplied && (sessions.get(supplied) || 0) > now) {
            req.sessionId = supplied;
            return next();
        }
        // Downloads never create a new identity or disclose whether a file exists.
        if (req.path.startsWith('/download')) return res.status(404).json({ error: 'Download unavailable' });
        for (const [id, expiry] of sessions) if (expiry <= now) sessions.delete(id);
        if (sessions.size >= 1000) return res.status(503).json({ error: 'Server is busy; try again shortly' });
        req.sessionId = crypto.randomBytes(32).toString('hex');
        sessions.set(req.sessionId, now + ttl);
        res.cookie('clickpdf_session', req.sessionId, { httpOnly: true, sameSite: 'strict', secure: req.secure || app.get('secureCookies'), maxAge: ttl, path: '/' });
        next();
    }

    function rateLimit(req, res, next) {
        const now = Date.now();
        for (const [ip, entry] of rates) if (entry.expires <= now) rates.delete(ip);
        const isDownload = req.path.startsWith('/download');
        const ip = `${req.socket.remoteAddress}:${isDownload ? 'download' : 'api'}`;
        if (!rates.has(ip)) {
            if (rates.size >= 1000) return res.status(503).json({ error: 'Server is busy; try again shortly' });
            rates.set(ip, { count: 0, expires: now + 10 * 60 * 1000 });
        }
        const entry = rates.get(ip);
        if (++entry.count > (options.rateLimit || (isDownload ? 60 : 30))) {
            res.set('Retry-After', String(Math.ceil((entry.expires - now) / 1000)));
            return res.status(429).json({ error: 'Too many requests; try again later' });
        }
        next();
    }

    async function saveOutput(req, bytes, requestedName, fallback) {
        const base = (requestedName || fallback).replace(/[^a-zA-Z0-9-_\s]/g, '').trim().slice(0, 80) || fallback;
        const filename = `${base}-${crypto.randomUUID()}.pdf`;
        const expiry = sessions.get(req.sessionId);
        if (!expiry || expiry <= Date.now()) throw badRequest('Session expired; retry the operation');
        // Bound accumulated output as well as individual requests. Include orphaned files from a restart.
        let storedBytes = 0;
        let storedFiles = 0;
        for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
            if (entry.isFile()) {
                const stat = fs.statSync(path.join(outputDir, entry.name));
                storedBytes += stat.size;
                storedFiles++;
            }
        }
        if (storedFiles + pendingOutputFiles >= 1000 || storedBytes + pendingOutputBytes + bytes.length > 512 * 1024 * 1024) throw badRequest('Output storage is full; retry after cleanup');
        pendingOutputBytes += bytes.length;
        pendingOutputFiles++;
        try {
            await fs.promises.writeFile(path.join(outputDir, filename), bytes, { flag: 'wx', mode: 0o600 });
        } catch (error) {
            await fs.promises.rm(path.join(outputDir, filename), { force: true }).catch(() => {});
            throw error;
        } finally {
            pendingOutputBytes -= bytes.length;
            pendingOutputFiles--;
        }
        outputs.set(filename, { owner: req.sessionId, expires: Math.min(expiry, Date.now() + ttl) });
        return filename;
    }

    function download(req, res) {
        const file = req.params.filename;
        const record = outputs.get(file);
        if (!record || record.owner !== req.sessionId || record.expires <= Date.now() || path.basename(file) !== file) return res.status(404).json({ error: 'Download unavailable' });
        res.download(path.join(outputDir, file), file, err => {
            if (err && !res.headersSent) res.status(404).json({ error: 'Download unavailable' });
        });
    }

    async function cleanupOldFiles() {
        const now = Date.now();
        for (const [filename, record] of outputs) {
            if (record.expires <= now) {
                outputs.delete(filename);
                await fs.promises.rm(path.join(outputDir, filename), { force: true }).catch(() => console.error('Output cleanup failed'));
            }
        }
        for (const [id, expiry] of sessions) if (expiry <= now) sessions.delete(id);
        for (const dir of [uploadDir, outputDir]) {
            for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
                if (!entry.isFile()) continue;
                const filePath = path.join(dir, entry.name);
                const stat = await fs.promises.stat(filePath).catch(() => null);
                if (stat && now - stat.mtimeMs >= ttl) await fs.promises.rm(filePath, { force: true }).catch(() => console.error('Stale file cleanup failed'));
            }
        }
    }

    return { upload, session, rateLimit, saveOutput, download, cleanupOldFiles };
}

module.exports = { createSecurity, number, IMAGE_OPTIONS, validateImage };
