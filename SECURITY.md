# Security Policy

Tonus processes authentication data and sensitive health information. Please
report security issues privately so they can be investigated and fixed before
details become public.

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](https://github.com/batstolya/tonus/security/advisories/new).
Do not open a public issue, discussion, pull request, or commit containing a
security report.

Include only the information needed to reproduce and assess the issue:

- the affected component, commit, or deployed surface;
- the expected and observed security boundary;
- minimal reproduction steps and the likely impact;
- any suggested mitigation, if known.

Use synthetic data and redact all sensitive values. Never publish or attach:

- API keys, access or refresh tokens, cookies, authorization headers, or
  database credentials;
- personal identifiers, database rows, Telegram payloads, or production logs
  containing user data;
- health measurements, symptoms, lab results, medical documents, or other
  private health information;
- complete exploit payloads or operational details that would let others abuse
  an unresolved vulnerability.

If a credential may already be exposed, revoke or rotate it immediately, then
submit the private report with the credential itself removed.

Please wait for written confirmation that a fix has been deployed before any
public disclosure. Maintainers may ask for additional sanitized evidence while
validating the report. This project does not currently operate a bug bounty
program.

## Supported version

Security fixes target the current `main` branch and the active production
deployment. Older commits, forks, and self-hosted deployments are not supported.

For non-security bugs that contain no sensitive data or exploit details, use a
regular GitHub issue.
