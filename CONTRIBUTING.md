# Contributing to ClickPDF Toolkit

Documentation, accessibility improvements, reproducible bug reports and focused implementations are welcome.

## Local setup

```bash
git clone https://github.com/Baillie11/ClickPDFToolkit.git
cd ClickPDFToolkit
npm ci
npm run dev
```

Open http://localhost:3000. For pull requests, work in a fork and a branch. Read the [feature status](README.md#features), [API](docs/API.md) and [technical review](docs/PROJECT_REVIEW.md). Run `npm test` for the workflow/security regression suite. There are no lint or build scripts at present. Development restarts use built-in Node.js watch mode.

## Issues and pull requests

- Report bugs through [GitHub Issues](https://github.com/Baillie11/ClickPDFToolkit/issues), including reproduction steps, expected/actual results, OS and Node.js/npm versions.
- Use small synthetic samples. Remove personal filenames, document contents, signatures, credentials and host details from logs.
- Explain the user task for feature requests. Discuss major changes and new processing dependencies first.
- Keep changes focused, preserve working workflows and retain MIT licensing.
- Describe the resulting behavior, limitations and validation in your pull request. Update feature status and API docs when behavior changes.
- Check upload, processing, download and failure paths. Inspect generated PDFs; HTTP 200 alone is insufficient. Check all three workflows when shared server/upload code changes.
- Add meaningful regression checks for application fixes where appropriate. Documentation changes need command, link and claim checks.
- Keep uploads, outputs, dependencies, environment files and sensitive samples out of commits.

Useful existing checks:

```bash
npm test
node --check server.js
node --check public/js/app.js
git diff --check
```

Dependency upgrades should be separately reviewed and tested. Avoid `npm audit fix --force` without assessing compatibility. Follow [SECURITY.md](SECURITY.md) for vulnerability reports.
