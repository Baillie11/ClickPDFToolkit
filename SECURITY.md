# Security

ClickPDF handles uploaded documents and currently suits local or trusted, access-controlled use. It binds to loopback by default and includes session-owned downloads, request/upload limits, content checks, safe filename handling and cleanup. It has no account/login system or built-in TLS. Read the [security review](docs/PROJECT_REVIEW.md#security-and-privacy-findings) before deployment.

## Reporting vulnerabilities

Do not publish private documents, credentials, exploit payloads or sensitive deployment details in public issues.

If **Security → Report a vulnerability** is available in GitHub, use it for a private report. Its availability has not been confirmed and no private security email is documented. If unavailable, open a minimal public issue asking the maintainer to establish a private channel, without disclosing exploit details.

Once a private channel exists, include the affected commit/runtime, impact and reproduction steps using synthetic data. No response-time guarantee or supported-version policy is currently established.

## Operator guidance

Restrict access, use HTTPS for remote traffic, set host filesystem permissions and resource limits, and review dependency advisories. Downloads require the creating session cookie. This is session isolation, not an account/login system; remote deployments still need operator-managed access restrictions. Periodic cleanup is best effort, not immediate deletion or secure erasure. Include uploads, outputs, logs and backups in your retention policy.
