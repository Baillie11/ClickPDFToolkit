# Security review and hosting guidance

Updated 2026-10-08. The initial repository review inspected source commit `d6faa58`; this document now describes the local security fixes layered on that checkout. Three PDF workflows remain implemented; the other 18 endpoints still return HTTP 501. No new PDF features were added.

## Verification

`npm test` exercises existing conversions, text/image overlays, both signature inputs, PDF downloads, session ownership, expiry, invalid content/options, upload limits, rate/concurrency limits, aborted-upload cleanup, host/origin checks, HTTPS proxy cookies and safe filename rendering. Samples are synthetic. PNG/JPEG/GIF/WebP outputs are parsed with pdf-lib. The suite includes a DOM regression check for malicious filenames; it is not a full interactive browser compatibility test.

## Security and privacy findings

| Initial finding | Fix |
| --- | --- |
| Public output directory with no ownership checks | Downloads now require the creating HttpOnly / SameSite=Strict session cookie and an unexpired in-memory ownership record. Full random UUID filenames; attachment downloads; no-store headers. |
| Open CORS and unrestricted host exposure | Removed CORS, bound to 127.0.0.1 by default, added host allowlist and origin/fetch-metadata checks. No forwarded headers are trusted. |
| Upload/processing exhaustion | 50 MiB/file, 100 MiB combined file bytes, 50 files, 20 fields, 1 MiB/field, 70 parts; flat fields only. Two active jobs/process, 30 API requests and 60 downloads/10 minutes per connected IP, 25 million pixels/image and 50 million combined uploaded image pixels/request. Stored output capped at 512 MiB / 1,000 files. |
| Unsafe names and untrusted upload types | Random disk upload names. Content checks for PDF headers and decoded image metadata; SVG/unsupported images rejected. Bounded numeric options, text and output-name length. |
| Failed/placeholder uploads retained | Cleanup after success, error and abort. Placeholder routes return 501 without parsing files. Startup and minute cleanup remove expired/stale files. |
| Filenames inserted into HTML | Preview nodes use textContent, safe property assignment and event listeners. Inline HTML handlers removed; restrictive Content Security Policy. |
| Internal errors and original filenames in logs | Processing failures use generic responses/log messages without original filenames or exception details. |
| Vulnerable dependencies | Updated Express, Multer and sharp, refreshed transitive packages, replaced UUID with Node.js crypto, and replaced Nodemon with Node.js watch mode. Final dependency audit recorded zero known vulnerabilities. |

Audit results are a point-in-time registry check, not a guarantee against undiscovered vulnerabilities. The dependency lockfile retains pdf-lib 1.17.1. MIT licensing is unchanged.

## Hosting configuration

Local default: `npm start`, then http://localhost:3000. Node.js 20.19+ is required; use a supported LTS release such as 22 or newer. `npm run dev` uses Node.js watch mode.

| Variable | Default / purpose |
| --- | --- |
| `PORT` | 3000 |
| `HOST` | 127.0.0.1; change only when network listening is intentional |
| `ALLOWED_HOSTS` | localhost,127.0.0.1,[::1]; comma-separated hostnames without ports |
| `PUBLIC_ORIGIN` | Unset locally; external HTTP(S) origin for a reverse proxy, e.g. https://pdf.example.test. HTTPS sets Secure cookies. No path/query/credentials allowed. |

These values must be passed through the process environment; `.env` is not loaded. For TLS termination, set PUBLIC_ORIGIN to the exact external origin and ensure the proxy passes a Host listed in ALLOWED_HOSTS. The app deliberately ignores X-Forwarded-* headers; rate limiting uses the connected peer IP, so clients behind a proxy share a limit. Add proxy-level per-user/IP limits if needed.

Use a reverse proxy or private network with operator-managed authentication and HTTPS for remote access. There is no login/account system. Cookie-based ownership isolates sessions but does not control who may create a session and use the service. Run one application instance per storage directory; sessions/limits/ownership are process-local. Restart invalidates downloads, including when watch mode restarts the server. Old files become inaccessible and are removed once stale.

## Remaining operating limits

- Processing is not sandboxed. pdf-lib can still consume substantial memory/CPU on hostile PDFs; request ingestion timeouts do not interrupt computation. Use trusted documents and OS/container memory/CPU limits. Strong isolation for arbitrary public uploads would require a separate processing worker architecture.
- Files are not encrypted by the app. Creation permissions are restrictive on platforms supporting Unix modes; Windows operators must apply appropriate ACLs. Protect host storage, logs and backups.
- Cleanup is best effort and stops when the server stops; filesystem errors can leave files behind. It is not secure erasure.
- TLS and user authentication are provided by deployment infrastructure, not the application.
- No obvious embedded credentials were found in the initial tracked source inspection; no full historical secret audit was performed.

## PDF workflow limitations

The editor adds overlays, not edits to existing content. Signing embeds an image, not a cryptographic signature. Standard Helvetica has text encoding limits. Drawn signatures have a white background. BMP backend compatibility remains unverified. Fill can extend into margins, and failures during full decoding may skip an image after initial validation. No new converter or editing features were added.

## GitHub discoverability

Recommended About description:

> Free, open-source PDF tools you can self-host. Convert images to PDF, add text and image overlays, and place signature images through a simple Node.js web interface.

Topics: `pdf`, `pdf-tools`, `pdf-converter`, `pdf-editor`, `image-to-pdf`, `nodejs`, `javascript`, `self-hosted`, `open-source`, `privacy`, `document-tools`.

These remain recommendations; GitHub settings were not changed.

## Screenshots to provide

Capture the real app using synthetic documents and fictitious signatures:

- `docs/images/home.png`: home screen with Available / Coming Soon labels.
- `docs/images/image-to-pdf.png`: upload previews and page/filename settings.
- `docs/images/conversion-result.png`: completion and download button.
- `docs/images/edit-overlay.png`: controls and real PDF output.
- `docs/images/signature.png`: drawing/upload controls and output.

No screenshots are currently included. Add README image links only once real assets exist.

## Further recommendations

Add real screenshots, enable private vulnerability reporting, run the regression suite in CI, use scoped contributor issues, and publish verified release notes. A publicly exposed processing demo needs operator-managed access controls and stronger document-processing isolation first.
