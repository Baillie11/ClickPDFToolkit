# Hosting ClickPDF under a URL path

ClickPDF supports a dedicated site root or a path such as `/clickpdf/`.
The application is live at **https://clickecommerce.com.au/clickpdf/**.

The lowercase `/clickpdf/` path is the canonical application mount, including
API URLs, download links and the session-cookie path. The old `/ClickPDF/`
entry and its subpaths redirect to lowercase with HTTP 308. The site-root
`.htaccess` block precedes WordPress routing; the prior host configuration is
backed up outside the public document root. Keep all existing WordPress rules:

```apache
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule ^clickpdf(?:/.*)?$ - [E=Cache-Control:no-cache,NC]
RewriteCond %{REQUEST_URI} !^/clickpdf/
RewriteRule ^clickpdf(?:/(.*))?$ https://clickecommerce.com.au/clickpdf/$1 [R=308,L,NC]
</IfModule>
```

The managed `/clickpdf/.htaccess` also excludes this application from inherited
LiteSpeed page caching. A cached WordPress 404 previously persisted at the
slashless URL despite a targeted cache purge. Preserve this custom block when
the hosting manager regenerates its own directives:

```apache
<IfModule LiteSpeed>
CacheDisable public /
CacheDisable private /
RewriteEngine On
RewriteRule .* - [E=Cache-Control:no-cache]
</IfModule>
```

This block is scoped to the application's directory; WordPress page caching
remains enabled on the rest of the website.

## VentraIP deployment status — 2026-11-01

The existing VentraIP service runs ClickPDF through CloudLinux/LiteSpeed with
Node.js 24.22.2 and `passenger.cjs`. Source code and runtime files remain outside
the public document root. The existing WordPress home page was checked and
continues to return HTTP 200.

Sharp's native and WebAssembly binaries could not run on the host CPU.
The opt-in [compatible image backend](IMAGE_BACKENDS.md) resolves this without
removing tools or downgrading Sharp. Set `IMAGE_BACKEND=imagemagick` and
`IMAGEMAGICK_BINARY=/bin/convert`. AVIF/HEIF decoding uses bounded Node workers;
it does not depend on the host's unavailable AVIF/HEIF ImageMagick codecs.

All **25 automated tests passed on the host**. Live HTTPS checks verified
image-to-PDF with PNG/JPEG/GIF/WebP/TIFF/AVIF, merge, split/extract, edit with
image overlays, visual signatures, session-protected downloads, cross-origin
rejection, assets and the `/clickpdf` trailing-slash redirect. The live browser
also rendered a synthetic four-page PDF into four PNG downloads. These checks
cover representative documents, not every possible PDF or browser.

After updating code, use the application's process-manager restart and verify
that the ClickPDF worker actually reloads. On this host the selector restart
reported success without replacing the running worker. A targeted termination
of the verified ClickPDF worker allowed LiteSpeed to respawn it with the new
code/environment. Never restart unrelated Node applications. Restarting loses
in-memory download sessions, so old links become invalid.

## Compress PDF release — 2026-11-17 (v1.1.0)

Compression was deployed from the versioned repository and verified over HTTPS.
The production engine uses the existing ImageMagick backend; no new runtime
dependency or paid conversion service was added. All 35 host-side compression,
interface, image, editor and security tests passed in private staging. Run these
tests with the underlying Node binary rather than the nodevenv launcher (which
restores production routing variables), and limit the shared-host thread pool:

```sh
env -u BASE_PATH -u PUBLIC_ORIGIN ALLOWED_HOSTS=localhost,127.0.0.1,[::1] \
  UV_THREADPOOL_SIZE=1 IMAGE_BACKEND=imagemagick IMAGEMAGICK_BINARY=/bin/convert \
  /opt/alt/alt-nodejs24/root/usr/bin/node --v8-pool-size=1 \
  --test-isolation=none --test-concurrency=1 --test \
  test/compress.test.js test/compress-ui.test.js test/images.test.js \
  test/security.test.js test/editor.test.js
```

A synthetic 2,591,976-byte PDF became 348,237 / 201,962 / 49,112 bytes
with the quality / balanced / smallest presets. Live downloads retained page
count, rotation and form values; size targeting, original-file fallback,
cross-session denial, cross-origin rejection, invalid options and merge-to-compress
handoff passed. The WordPress home page and new frontend assets returned HTTP 200.
The output PDF was also rendered for visual review. Browser UI automation stopped
because it could not verify the current Chrome URL, so a manual interactive
browser review remains outstanding; interface behavior has automated coverage.

The restart marker alone did not reload the old worker. The verified ClickPDF
process was terminated and LiteSpeed respawned it; live API checks then passed.
The pre-release tracked source is archived privately at
`tmp/pre-compress-0c0b3db.tar.gz`; the previous repository revision is `0c0b3db`.
Preserve untracked host launchers and `.htaccess` during any rollback, then restart
only the verified ClickPDF worker and repeat HTTPS checks.

## Runtime and storage

Use a supported Node.js LTS release compatible with `package.json` (22 or 24).
Install with `npm ci`, run `npm test`, and start with `npm start`.
No frontend build is required. Node.js 20 meets the minimum package requirement
only at 20.19 or newer, but is now [end of life](https://nodejs.org/en/about/previous-releases).

Keep the application and its `uploads/` and `output/` directories outside the
website's public document root. Only `public/` contains public assets. Never
expose the repository or runtime files through a static directory listing.
Give the application user write access to storage.

Run exactly one application process per storage directory: session and download
ownership are held in memory. Restarting invalidates download links. Use the
hosting platform's process manager to keep the app running.

## Path configuration

Set these non-secret variables in the process manager's environment:

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
ALLOWED_HOSTS=clickecommerce.com.au
PUBLIC_ORIGIN=https://clickecommerce.com.au
BASE_PATH=/clickpdf
IMAGE_BACKEND=imagemagick
IMAGEMAGICK_BINARY=/bin/convert
UV_THREADPOOL_SIZE=1
```

The domain above is the verified deployment target.
Adjust host and port for the platform. `.env` files are not loaded automatically.
`PUBLIC_ORIGIN` contains only the origin, with no path. `BASE_PATH` has no
trailing slash; leave it empty for a dedicated site root.

The HTTPS proxy must preserve the original Host header and forward the full
request path, including `/clickpdf`, to Node.js. A proxy that strips the prefix
needs a different mapping; do not deploy that configuration untested. Requests
to `/clickpdf` redirect to `/clickpdf/` so relative frontend URLs resolve
correctly. APIs and downloads use the same prefix; the session cookie is
scoped to `/clickpdf/`.

On cPanel/CloudLinux, first confirm that the correct domain's account has a
supported Node.js runtime and application manager. Static file upload alone
cannot run ClickPDF. Confirm the manager's startup-file and URL-mount behavior
before registering an app; `npm start` above is not a verified Passenger recipe.
Preserve existing website routing and back it up before adding a path mapping.
See the [CloudLinux documentation](https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components/).

## Access and limits

Provide HTTPS, operator-managed access restrictions and process resource limits.
ClickPDF has no login system, and processing untrusted PDFs can consume CPU and
memory. The app does not trust forwarded IP headers; requests behind a proxy
can share a rate-limit bucket. Configure proxy upload/time limits with the
documented 100 MiB combined upload limit in mind. Never publish `uploads/` or
`output/` as a workaround for failed downloads.

## Deployment verification

- Confirm the existing website works and `/clickpdf` redirects correctly.
- Verify the home page, stylesheet and both scripts under `/clickpdf/`.
- Open Edit PDF and PDF to Image with a synthetic PDF. Confirm `/clickpdf/vendor/pdfjs/pdf.worker.min.js` loads and the browser console shows no Content-Security-Policy errors (pdf.js is bundled; no CDN is used).
- Use synthetic documents to exercise merge, image conversion, edit and sign.
- Inspect each output; verify a separate session cannot download it.
- Check cross-origin requests are rejected and uploaded inputs are removed.
- Verify process supervision, resource limits and file expiration on the host.

Repeat live checks after any deployment or hosting configuration change.
See the [security review](PROJECT_REVIEW.md) for remaining limitations.
