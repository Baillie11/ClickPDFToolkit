# Hosting ClickPDF under a URL path

ClickPDF supports a dedicated site root or a path such as `/ClickPDF/`.
No hosted demo has been verified yet; these instructions prepare deployment.

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
BASE_PATH=/ClickPDF
```

The domain is the intended deployment target, not a claim that it is live.
Adjust host and port for the platform. `.env` files are not loaded automatically.
`PUBLIC_ORIGIN` contains only the origin, with no path. `BASE_PATH` has no
trailing slash; leave it empty for a dedicated site root.

The HTTPS proxy must preserve the original Host header and forward the full
request path, including `/ClickPDF`, to Node.js. A proxy that strips the prefix
needs a different mapping; do not deploy that configuration untested. Requests
to `/ClickPDF` redirect to `/ClickPDF/` so relative frontend URLs resolve
correctly. APIs and downloads use the same prefix; the session cookie is
scoped to `/ClickPDF/`.

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

- Confirm the existing website works and `/ClickPDF` redirects correctly.
- Verify the home page, stylesheet and both scripts under `/ClickPDF/`.
- Use synthetic documents to exercise merge, image conversion, edit and sign.
- Inspect each output; verify a separate session cannot download it.
- Check cross-origin requests are rejected and uploaded inputs are removed.
- Verify process supervision, resource limits and file expiration on the host.

Keep the README's hosted-demo status unchanged until live checks pass.
See the [security review](PROJECT_REVIEW.md) for remaining limitations.
