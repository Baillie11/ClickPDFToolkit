# Image processing backends

The default backend is Sharp. On a host whose CPU cannot load Sharp, explicitly
set `IMAGE_BACKEND=imagemagick` and `IMAGEMAGICK_BINARY=/bin/convert` (adjust the
absolute executable path for your host). No PDF tools are disabled by this choice.

The compatibility backend uses the host's maintained ImageMagick installation
for PNG, JPEG, GIF, WebP and TIFF, `libheif-js` for HEIF metadata/HEVC decoding,
and the baseline WebAssembly AVIF decoder from `@jsquash/avif` for AVIF pixels.
`pngjs` writes the portable decoders' PNG output. All processing stays on the
ClickPDF server. Sharp remains installed and unchanged for other deployments.

Common images use isolated child processes; portable codecs use isolated Node.js
workers to avoid LiteSpeed launcher conflicts. Both have a 25-second wall
timeout, capped input/output, first-frame selection and a 25-million-pixel
dimension check before decoding. Portable workers cap their JavaScript heap at
384 MiB; native/WebAssembly allocations also depend on host process limits. The ImageMagick policy disables delegates,
filters and unrelated coders, limits threads and memory, and disables disk
pixel caches. Commands use argument arrays without a shell; filenames and
options are not supplied by uploaded content. These limits supplement the
application's existing upload, concurrency and storage limits, not a full OS
sandbox. Keep system ImageMagick and its codec libraries security-patched.

Run the same tests against either backend:

```sh
npm test
IMAGE_BACKEND=imagemagick IMAGEMAGICK_BINARY=/bin/convert node --test --test-concurrency=1
```

Tests cover existing PDF workflows, PNG/JPEG/GIF/WebP/TIFF/AVIF conversion,
dimensions, representative colours, transparency, the first animated frame,
invalid inputs and protected downloads. HEVC/HEIF support depends on the
portable decoder and is not covered by a representative HEIC fixture yet.
BMP remains outside the server's allowed formats. Colour conversion between
backends can differ slightly; this is not an archival colour-management tool.

ClickPDF retains its MIT licence. Runtime dependencies retain their own
licences: [libheif-js](https://github.com/catdad-experiments/libheif-js) is LGPL-3.0,
[@jsquash/avif](https://github.com/jamsinclair/jSquash) is Apache-2.0 with its
bundled codec notices, and [pngjs](https://github.com/pngjs/pngjs) is MIT.
Dependencies are installed unmodified through npm; their licences and notices
remain in their packages.
