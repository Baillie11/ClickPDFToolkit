const { Worker } = require('node:worker_threads');
const path = require('node:path');

function compressPdf(bytes, preset, targetBytes, signal) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env };
        for (const key of Object.keys(env)) if (key.startsWith('LSNODE_') || key.startsWith('LSAPI_')) delete env[key];
        const worker = new Worker(path.join(__dirname, 'compress-process.js'), {
            workerData: { bytes, preset, targetBytes }, env, execArgv: [],
            resourceLimits: { maxOldGenerationSizeMb: 384 }, stdout: true, stderr: true
        });
        worker.stdout.resume(); worker.stderr.resume();
        let settled = false;
        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            worker.terminate();
            if (error) reject(error); else resolve(result);
        };
        const abort = () => finish(new Error('Compression cancelled.'));
        const timer = setTimeout(() => finish(new Error('Compression took too long. Try a smaller PDF.')), 45_000);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) return abort();
        worker.on('message', result => {
            if (result.error) return finish(new Error(result.error));
            if (!result.bytes?.length || result.bytes.length > bytes.length) return finish(new Error('Compression output exceeded limits.'));
            finish(null, { ...result, bytes: Buffer.from(result.bytes) });
        });
        worker.on('error', () => finish(new Error('Compression exceeded available resources. Try a smaller PDF.')));
        worker.on('exit', () => { if (!settled) finish(new Error('Compression could not finish. Try a smaller PDF.')); });
    });
}
module.exports = { compressPdf };
