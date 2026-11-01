// Shared page-selection validation; the API uses 1-based page numbers.
(function (root) {
    function pageGroups(mode, selection, pageCount) {
        const fail = message => { throw new Error(message); };
        if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 1000) fail('Use a PDF with 1–1,000 pages.');
        if (!['extract', 'ranges', 'pages'].includes(mode)) fail('Choose a valid split mode.');
        if (mode === 'pages') {
            if (pageCount > 50) fail('Separate-page mode supports up to 50 pages. Use ranges for larger documents.');
            return Array.from({ length: pageCount }, (_, index) => [index]);
        }
        if (typeof selection !== 'string' || !selection.trim() || selection.length > 5000) fail('Enter pages such as 1-3, 5, 8-10.');
        const tokens = selection.split(',');
        if (tokens.length > 1000 || (mode === 'ranges' && tokens.length > 50)) fail('Choose at most 50 output files and 1,000 pages.');
        let total = 0;
        const seen = new Set();
        const groups = tokens.map(token => {
            const match = /^\s*([1-9]\d*)(?:\s*-\s*([1-9]\d*))?\s*$/.exec(token);
            if (!match) fail('Use page numbers and ascending ranges separated by commas, such as 1-3, 5.');
            const start = Number(match[1]);
            const end = Number(match[2] || match[1]);
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end > pageCount) fail(`Pages must be between 1 and ${pageCount}, with ranges in ascending order.`);
            total += end - start + 1;
            if (total > 1000) fail('Select at most 1,000 pages.');
            const group = [];
            for (let page = start; page <= end; page++) {
                if (seen.has(page)) fail('Page selections overlap. Choose each page only once.');
                seen.add(page);
                group.push(page - 1);
            }
            return group;
        });
        return mode === 'extract' ? [groups.flat()] : groups;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { pageGroups };
    else root.ClickPDFSelection = { pageGroups };
})(typeof window !== 'undefined' ? window : this);
