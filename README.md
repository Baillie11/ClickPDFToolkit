# ClickPDF Toolkit

**ClickPDF — Free, open-source PDF tools you can run yourself.** Convert images to PDF, add text and image overlays, and place signature images through a simple Node.js / JavaScript web interface. Self-host document processing without relying on third-party online PDF services.

[![MIT Licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/runtime-Node.js-339933.svg)](package.json)
[![JavaScript](https://img.shields.io/badge/language-JavaScript-F7DF1E.svg)](public/js/app.js)

[Quick start](#quick-start) · [Features](#features) · [API](docs/API.md) · [Contribute](CONTRIBUTING.md) · [Issues](https://github.com/Baillie11/ClickPDFToolkit/issues)

## Screenshot / demo

No screenshots or hosted demo are included yet. Run locally to try the real application.

**Screenshots requested, not yet available:** home screen; image upload with previews; conversion settings; completed conversion and download button; editor and signature workflows. Use synthetic documents and non-sensitive filenames. See the [asset checklist](docs/PROJECT_REVIEW.md#screenshots-to-provide).

## Why ClickPDF?

- **Free and open source:** inspect, modify and share under the MIT licence.
- **Self-hostable:** run on your computer or infrastructure.
- **Control over processing:** implemented tools process documents on your ClickPDF server without external conversion APIs.
- **Simple interface:** browse or drop files, choose settings and download a PDF.
- **Approachable JavaScript:** Express routes and vanilla HTML/CSS/JavaScript.

This early-stage free PDF toolkit currently has three implemented workflows. Use it locally or in a trusted, access-controlled environment. Read the privacy section before deployment.

## Features

### Working features

| Tool | Implemented behavior | Limits |
| --- | --- | --- |
| Image to PDF | One page per successfully processed image; A4, Letter, Legal, A3, A5; portrait/landscape; fit, fill, stretch; custom output name | Up to 50 files, 50 MiB per file, 100 MiB total; image dimension limits apply. PNG, JPEG, GIF and WebP verified. BMP is accepted by the interface but processor support is unverified. Animated GIFs are not converted frame by frame. |
| Edit PDF | Add Helvetica text and an image overlay to a selected page; text size/color, position and image scale | Basic overlays only. No editing of existing text, redaction, annotation objects or live PDF preview. Standard-font encoding limits apply. |
| Sign PDF | Draw a signature or upload an image, then place it on a selected page | Visual signature image only. No certificate-based digital signing or signature validation. Drawn signatures have a white background. |

Representative API workflows were verified with synthetic documents on Node.js 20.20.2, and downloaded PDFs were parsed with pdf-lib. This does not establish compatibility with every browser, format or document.

### Partial, scaffold and planned features

| Category | Status |
| --- | --- |
| The three workflows above | Implemented for the stated scope, with documented limitations |
| Broader editing / signing capabilities | Partial: overlays and visual signing exist; broader editing and cryptographic signing do not |
| Merge, split, reorder, rotate | UI cards and API scaffolds; processing not implemented |
| Compress, watermark | UI cards and API scaffolds; processing not implemented |
| Word, PowerPoint, Excel ↔ PDF | UI cards and API scaffolds; conversion not implemented |
| HTML to PDF, PDF to image | UI cards and API scaffolds; conversion not implemented |
| Protect, unlock, OCR, extract text | UI cards and API scaffolds; processing not implemented |

All 18 scaffold endpoints return **HTTP 501 Not Implemented**. “Coming Soon” expresses intended scope, not a delivery date. Do not upload documents to these endpoints expecting processing.

## Installation

Requirements: Git, npm and a Node.js runtime compatible with the locked dependencies. Node.js **20.19+** is required; use a supported LTS release (22 or newer). Node.js 20.20.2 was used for local verification. Installation needs network access for packages and sharp's platform dependencies.

```bash
git clone https://github.com/Baillie11/ClickPDFToolkit.git
cd ClickPDFToolkit
npm ci
```

## Quick start

```bash
npm start
```

Open **http://localhost:3000**. For automatic server restarts during development:

```bash
npm run dev
```

There is no build step. The server creates `uploads/` and `output/` and needs write permission to them. The server binds to `127.0.0.1` by default. `PORT` changes the port; remote hosting requires explicit `HOST`, `ALLOWED_HOSTS` and, for a TLS reverse proxy, `PUBLIC_ORIGIN` configuration. See [hosting guidance](docs/PROJECT_REVIEW.md#hosting-configuration). No API key is required. `.env` files are not loaded automatically.

## Usage

1. Select **Image to PDF**, **Edit PDF** or **Sign PDF**.
2. Browse or drop input files into the upload area.
3. Choose page settings, overlay content, or a drawn/uploaded signature and target page.
4. Run the operation and download the result.

Image selection order determines page order; remove unwanted images before converting. Custom output names receive a full random UUID suffix. Download in the same browser session within its one-hour lifetime. Links do not work in another browser or after a server restart.

Margins use PDF points; zero margin and zero coordinates are supported. Numeric options are validated against bounded ranges. Fill mode can extend into margins and crop at the page edge. Invalid or oversized image headers reject the request. A later image decoding failure can still skip an image; check the resulting page count. See the [technical review](docs/PROJECT_REVIEW.md).

## API documentation

| Endpoint | Multipart input |
| --- | --- |
| `POST /api/image-to-pdf` | Repeated `images` files and page options |
| `POST /api/edit` | `pdf`, optional `overlayImage`, text and placement options |
| `POST /api/sign` | `pdf` and `signatureImage` or `signatureData` |
| `GET /download/<filename>` | Generated output download; no request body |

[API reference and curl examples](docs/API.md).

## Technology stack

Node.js · Express · pdf-lib · sharp · multer · vanilla JavaScript · HTML · CSS. Built-in Node.js crypto generates IDs and watch mode provides development restarts. No database, account system or frontend framework is implemented.

## Privacy and self-hosting

Documents leave the browser and are uploaded to **the machine running ClickPDF**. Implemented routes have no external document-processing calls; the frontend uses local assets and same-origin API requests. Self-hosting gives you control over storage and access. Local safeguards are implemented; public deployment still needs operator-managed authentication, HTTPS and resource isolation.

- Input files are cleaned up after successful, failed and aborted processing. Placeholder routes reject requests before parsing uploads.
- Cleanup runs at startup and every minute. Outputs expire after at most one hour, tied to their creating session; stale files are deleted on a best-effort basis. Cleanup stops with the server.
- The app stores files unencrypted on disk. Host permissions, backups and logs are the operator's responsibility.
- Download access requires the creating session cookie, with HttpOnly and SameSite=Strict protection. Downloads are attachments and are not cached. Session ownership is kept in memory and lost on restart.
- The server binds to loopback, rejects unapproved hosts/cross-origin requests and limits API requests (30 per 10 minutes per connected IP) and downloads (60 per 10 minutes), concurrent processing (2), image dimensions and stored output (512 MiB / 1,000 files). There is no account/login system or built-in TLS.

For shared hosting, use access restrictions, HTTPS and resource limits, and address the [security findings](docs/PROJECT_REVIEW.md#security-and-privacy-findings). Package installation accesses external registries; document conversion does not require a third-party PDF service.

## Project structure

```text
public/       HTML, CSS and browser JavaScript
routes/       Three implemented tools and 18 placeholder handlers
server.js     Express, uploads, downloads and cleanup
docs/         API reference and repository review
uploads/      Runtime input files (ignored)
output/       Runtime output files (ignored)
```

## Roadmap

Suggested priorities, with no promised release dates:

- [x] Add local upload validation, session-owned downloads, cleanup and resource limits.
- [x] Upgrade affected dependencies and verify the locked dependency audit.
- [x] Validate coordinates, margins and other numeric options.
- [ ] Improve error feedback and format compatibility.
- [x] Add workflow and security regression tests (`npm test`).
- [ ] Add real screenshots.
- [ ] Implement merge, split, rotate and reorder.
- [ ] Evaluate remaining conversion, compression, watermark, password and text tools before committing to their scope.

## Contributing

Documentation, reproducible bugs, accessibility improvements and focused implementations are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md). Discuss substantial changes in an issue first and preserve working workflows.

## Bugs, feature requests and security

[Open an issue](https://github.com/Baillie11/ClickPDFToolkit/issues) with reproduction steps, expected/actual results and runtime details. Describe the document task for feature requests. Use synthetic samples; never attach private documents, signatures or credentials. Follow [SECURITY.md](SECURITY.md) for security reporting.

## Licence

[MIT](LICENSE), preserving the repository's existing MIT declaration.

## Support the project

[Source](https://github.com/Baillie11/ClickPDFToolkit) · [Issues](https://github.com/Baillie11/ClickPDFToolkit/issues) · [Change log](CHANGELOG.md)

If you find ClickPDF useful, please consider giving the repository a ⭐. It helps others discover the project.
