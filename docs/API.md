# ClickPDF API

Base URL for local use: `http://localhost:3000`. POST endpoints use `multipart/form-data`; let your client set its boundary. File limit: 50 MiB per file. Downloads require the session cookie set by an implemented API request. There is no account/login system. Use trusted inputs and retain cookies between upload and download. Requests from other browser origins are rejected.

Limits also include 100 MiB combined file bytes, 50 files, 20 fields, 1 MiB per field, 25 million pixels per image, 50 million combined uploaded image pixels, two active jobs, and 30 API requests plus 60 downloads per 10 minutes per connected IP. SVG inputs are rejected. Fields must be flat scalar strings. Coordinates range from 0–100, scales from 10–200, font size from 8–72, and page number is a positive integer.

The curl POST examples below save and reuse a session with `-c clickpdf-cookies.tmp -b clickpdf-cookies.tmp`. Download the returned URL with the same cookie jar:

```bash
curl -b clickpdf-cookies.tmp -o result.pdf "http://localhost:3000/download/<returned-filename>"
```

Replace the placeholder with the returned URL-encoded filename. Do not share or commit cookie jars. Keep the same hostname for upload and download (localhost and 127.0.0.1 have different browser cookie scopes).

## Image to PDF

`POST /api/image-to-pdf`

| Field | Meaning / server default |
| --- | --- |
| `images` | Repeated image files, maximum 50 |
| `pageSize` | A4 (default), Letter, Legal, A3 or A5; other values are rejected |
| `orientation` | portrait (default) or landscape |
| `margin` | Integer PDF points, 0–100; default 20 |
| `fitMode` | fit (default), fill or stretch; other values are rejected |
| `outputFilename` | Base name, default images-to-pdf; sanitized, then random suffix and .pdf added |

```bash
curl -c clickpdf-cookies.tmp -b clickpdf-cookies.tmp -F "images=@photo.png" -F "images=@photo.jpg" -F "pageSize=A4" -F "orientation=portrait" -F "margin=20" -F "fitMode=fit" -F "outputFilename=my-document" http://localhost:3000/api/image-to-pdf
```

Use `curl.exe` on Windows if `curl` is a PowerShell alias. Replace sample filenames with your own local, non-sensitive files.

Successful response shape (illustrative filename):

```json
{
  "success": true,
  "message": "Successfully converted 2 image(s) to PDF",
  "downloadUrl": "/download/my-document-12345678-1234-4123-8123-123456789abc.pdf",
  "filename": "my-document-12345678-1234-4123-8123-123456789abc.pdf",
  "pageCount": 2
}
```

One page is produced per successfully processed image. Invalid or oversized image headers reject the request before conversion. Later decoding failures can still skip individual images without a per-file error list; compare `pageCount` with the upload count. Fill preserves aspect ratio but can extend into margins; stretch distorts it. GIF processing does not create a page for every animation frame.

## Add text / image overlays

`POST /api/edit`

| Field | Meaning / server default |
| --- | --- |
| `pdf` | Required PDF file |
| `overlayImage` | Optional image file |
| `pageNumber` | One-based target page; default 1 |
| `text` | Optional text drawn using Helvetica |
| `fontSize`, `textColor` | Default 12 points and black; color as hex, e.g. #2563eb |
| `textX`, `textY` | Percentage position; both default 50; Y measured from top to text baseline |
| `imageX`, `imageY` | Image center as percentage of page; both default 50 |
| `imageScale` | Default 100; drawn dimensions = embedded dimensions × scale/100 × 0.5 |
| `outputFilename` | Default edited-pdf |

```bash
curl -c clickpdf-cookies.tmp -b clickpdf-cookies.tmp -F "pdf=@document.pdf" -F "text=Reviewed" -F "pageNumber=1" -F "fontSize=16" -F "textX=10" -F "textY=10" http://localhost:3000/api/edit
```

This adds content; it does not edit or remove existing content. Standard Helvetica does not encode every Unicode character.

## Place a visual signature

`POST /api/sign`

| Field | Meaning / server default |
| --- | --- |
| `pdf` | Required PDF file |
| `signatureImage` | Uploaded image, required unless signatureData is supplied |
| `signatureData` | Image data URL (browser canvas); takes precedence over uploaded image |
| `pageNumber` | One-based target page; default 1 |
| `signatureX`, `signatureY` | Image center in page percentages; defaults 70 and 90 |
| `signatureScale` | Default 100; width = 200 PDF points × scale/100; height preserves aspect ratio |
| `outputFilename` | Default signed-document |

```bash
curl -c clickpdf-cookies.tmp -b clickpdf-cookies.tmp -F "pdf=@document.pdf" -F "signatureImage=@signature.png" -F "pageNumber=1" http://localhost:3000/api/sign
```

This embeds an image; it does not create a cryptographic digital signature. A transparent PNG is useful for uploaded signatures. The drawing canvas currently has a white background.

## Responses and downloads

Edit and sign return `success`, `message`, `downloadUrl` and `filename`, without `pageCount`. Retrieve the exact returned URL with a GET request. URL-encode spaces if your client does not do so automatically. Downloads require the same session cookie, expire within the one-hour session lifetime and become unavailable after restart. Expired files are removed by best-effort startup/minute cleanup.

Invalid content, missing input, invalid pages and invalid options return 400 with a generic `error`. Upload limits return 413, disallowed host/origin returns 403, request-rate limits return 429 (with Retry-After), and concurrent/session capacity returns 503. Numeric values must be finite and in range; zero coordinates and margins are preserved. UI defaults can differ from server defaults.

## Placeholder endpoints

These routes perform no document processing and return 501 for otherwise accepted requests:

`/api/merge`, `/api/split`, `/api/compress`, `/api/pdf-to-word`, `/api/word-to-pdf`, `/api/pdf-to-ppt`, `/api/ppt-to-pdf`, `/api/pdf-to-excel`, `/api/excel-to-pdf`, `/api/pdf-to-image`, `/api/watermark`, `/api/rotate`, `/api/html-to-pdf`, `/api/unlock`, `/api/protect`, `/api/ocr`, `/api/extract-text`, `/api/reorder`.

The server returns 501 before parsing or saving uploads. Do not use these routes as converters.
