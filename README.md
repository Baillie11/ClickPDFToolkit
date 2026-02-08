# Click PDF Toolkit

A comprehensive PDF toolkit for editing, converting, and manipulating PDF files. Built with Node.js, Express, and vanilla JavaScript.

## Features

### Available Now
- **Image to PDF** - Convert multiple images (JPG, PNG, GIF, BMP, WebP) to a single PDF document with customizable options

### Coming Soon
- **Merge PDFs** - Combine multiple PDF files into one
- **Split PDF** - Split a PDF into individual pages or page ranges
- **Compress PDF** - Reduce PDF file size
- **PDF to Word** - Convert PDF to Word document (.docx)
- **Word to PDF** - Convert Word documents to PDF
- **PDF to PowerPoint** - Convert PDF to presentation (.pptx)
- **PowerPoint to PDF** - Convert presentations to PDF
- **PDF to Excel** - Convert PDF to spreadsheet (.xlsx)
- **Excel to PDF** - Convert spreadsheets to PDF
- **Edit PDF** - Add text, images, and annotations
- **PDF to Image** - Convert PDF pages to images
- **Sign PDF** - Add digital signatures
- **Watermark** - Add text or image watermarks
- **Rotate PDF** - Rotate pages by 90°, 180°, or 270°
- **HTML to PDF** - Convert web pages to PDF
- **Unlock PDF** - Remove password protection
- **Protect PDF** - Add password protection
- **OCR PDF** - Extract text from scanned PDFs
- **Extract Text** - Extract text content from PDF
- **Reorder Pages** - Rearrange PDF pages

## Installation

1. Clone or download the repository
2. Navigate to the project directory:
   ```bash
   cd ClickPDFToolkit
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

The application will be available at `http://localhost:3000`

## API Endpoints

### Image to PDF
```
POST /api/image-to-pdf
Content-Type: multipart/form-data

Parameters:
- images: Image files (multiple)
- pageSize: A4, Letter, Legal, A3, A5 (default: A4)
- orientation: portrait, landscape (default: portrait)
- margin: Page margin in pixels (default: 20)
- fitMode: fit, fill, stretch (default: fit)

Response:
{
  "success": true,
  "message": "Successfully converted X image(s) to PDF",
  "downloadUrl": "/download/filename.pdf",
  "filename": "filename.pdf",
  "pageCount": X
}
```

## Project Structure

```
ClickPDFToolkit/
├── public/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   └── app.js
│   └── index.html
├── routes/
│   ├── imageToPdf.js      # Fully implemented
│   ├── merge.js           # Scaffold
│   ├── split.js           # Scaffold
│   ├── compress.js        # Scaffold
│   ├── pdfToWord.js       # Scaffold
│   ├── wordToPdf.js       # Scaffold
│   ├── pdfToPpt.js        # Scaffold
│   ├── pptToPdf.js        # Scaffold
│   ├── pdfToExcel.js      # Scaffold
│   ├── excelToPdf.js      # Scaffold
│   ├── edit.js            # Scaffold
│   ├── pdfToImage.js      # Scaffold
│   ├── sign.js            # Scaffold
│   ├── watermark.js       # Scaffold
│   ├── rotate.js          # Scaffold
│   ├── htmlToPdf.js       # Scaffold
│   ├── unlock.js          # Scaffold
│   ├── protect.js         # Scaffold
│   ├── ocr.js             # Scaffold
│   ├── extractText.js     # Scaffold
│   └── reorder.js         # Scaffold
├── uploads/               # Temporary upload storage
├── output/                # Generated files storage
├── server.js
├── package.json
└── README.md
```

## Technologies Used

- **Backend**: Node.js, Express
- **PDF Processing**: pdf-lib
- **Image Processing**: sharp
- **File Upload**: multer
- **Frontend**: Vanilla HTML, CSS, JavaScript

## License

MIT
