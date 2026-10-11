# Change log

This file records changes from the repository presentation update onward. The package version is 1.0.0; no historical release dates are inferred.

## Unreleased

### Subpath hosting preparation

- Add optional `BASE_PATH` configuration, relative browser asset/API URLs, prefixed download links and scoped session cookies.
- Test all four workflows and access controls under `/ClickPDF/` as well as the existing root installation.
- Add deployment guidance covering runtime support, private storage, proxy path handling and live verification. No hosted deployment is claimed.

### Added — 2026-10-12

- Merge PDFs: combine 2–50 documents in a chosen order, with move-up/down and remove controls, size/count validation and a custom output filename.
- Preserve page sizes, rotations and page content; flatten form fields to avoid name collisions between documents.
- Reject encrypted, unreadable, empty and excessive inputs without saving a partial result. Limit merged output to 1,000 pages and reuse session-owned downloads and upload cleanup.
- Add merge API, ordering/form/error regressions and interface-state tests. Four tools are now implemented; 17 remain placeholders.

### Repository presentation

- Repositioned the README around free, open-source PDF tools users can self-host.
- Documented three implemented workflows, their limits and 18 HTTP 501 scaffolds.
- Added API, contributor, security, privacy and screenshot guidance.
- Added a standard MIT licence file alongside the existing MIT declaration.
- Improved package metadata and ignore rules.

### Security and dependencies

- Bound the server to loopback by default, with explicit host/origin configuration for remote hosting.
- Added session-owned, expiring downloads with attachment and no-cache headers.
- Added upload/content validation, numeric bounds, processing/request/storage limits and cleanup on failure/abort.
- Reject placeholder requests before writing uploaded files.
- Removed filename HTML interpolation and inline handlers; added browser security headers.
- Updated Express, Multer and sharp and refreshed transitive packages; the final audit reports zero known vulnerabilities.
- Replaced UUID and Nodemon with built-in Node.js crypto and watch mode; require Node.js 20.19+.
- Added `npm test` for workflow and security regressions.

The earlier security update added no PDF tools. API clients must preserve session cookies for downloads. Downloads expire within one hour and are invalidated by restart. Invalid/out-of-range inputs are rejected. Zero coordinates and margins are supported.
