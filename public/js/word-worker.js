// Conversion runs off the UI thread and is terminated on timeout or reset.
self.addEventListener('unhandledrejection', event => { event.preventDefault(); self.postMessage({ error: 'This document contains formatting or images that could not be converted. Try a simpler DOCX.' }); });
self.onmessage = async ({ data }) => {
    try {
        if (data.kind === 'docx') {
            importScripts('../vendor/word/mammoth.browser.js');
            let skippedImages = 0;
            const result = await mammoth.convertToHtml({ arrayBuffer: data.buffer }, {
                externalFileAccess: false, includeEmbeddedStyleMap: false,
                convertImage: mammoth.images.imgElement(async image => {
                    if (!['image/png', 'image/jpeg'].includes(image.contentType)) { skippedImages++; return { src: '' }; }
                    return { src: `data:${image.contentType};base64,${await image.read('base64')}` };
                })
            });
            self.postMessage({ html: result.value, warnings: result.messages.length + skippedImages });
        } else if (data.kind === 'pdf') {
            importScripts('../vendor/word/pdfmake.min.js', '../vendor/word/vfs_fonts.js');
            pdfMake.createPdf(data.definition).getBlob(blob => self.postMessage({ blob }));
        }
    } catch { self.postMessage({ error: 'Could not convert this document. Use an unencrypted DOCX with simpler formatting and valid images.' }); }
};
