# Change log

This file records changes from the repository presentation update onward. The package version is 1.0.0; no historical release dates are inferred.

## Unreleased

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

No new PDF tools were added. API clients must preserve session cookies for downloads. Downloads expire within one hour and are invalidated by restart. Invalid/out-of-range inputs are now rejected. Zero coordinates and margins are supported.
