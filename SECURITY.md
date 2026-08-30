# Security Policy

Rizzzler takes application security seriously. This project handles user accounts, profile data, auth tokens, emails, and uploaded media, so all vulnerabilities should be reported privately before any public disclosure.

## Supported Versions

The latest branch on GitHub is the actively maintained version and receives security updates.

| Version | Status |
| ------- | ------ |
| Latest main branch | ✅ Supported |
| Older or archived branches | ❌ Not guaranteed |

---

## Reporting a Vulnerability

If you discover a security issue, please do not open a public GitHub issue or discussion thread.

Instead, report it privately via:

- Email: developerpuneet2010@gmail.com
- GitHub private contact if the project owner has enabled one for the repository

Please include:
- a clear description of the issue
- steps to reproduce it
- affected route, controller, or module if known
- proof of concept or screenshots when useful
- security impact and likely exploitability

---

## Response Expectations

After a valid report is received, the project maintainer will:

- acknowledge the report as soon as practical
- review the issue and validate the impact
- work toward a fix or mitigation
- communicate status updates during investigation

For high-impact issues, a faster response may be appropriate depending on exploit severity and exposure.

---

## In Scope

Examples of issues that should be reported include:

- authentication bypass or privilege escalation
- authorization flaws in admin/dashboard routes
- insecure session handling
- cross-site scripting (XSS)
- cross-site request forgery (CSRF)
- injection issues in database or query logic
- exposed secrets or environment leakage
- SSRF or unsafe outbound requests
- sensitive data exposure in logs, responses, or error pages
- dependency vulnerabilities affecting runtime or build security

---

## Out of Scope

The following are generally not considered valid private security reports unless they reveal a new or exploitable product vulnerability:

- generic best-practice suggestions without a concrete exploit
- issues limited to third-party services outside Rizzzler's control
- purely theoretical risk without a practical attack path
- spam, nuisance reports, or low-impact informational findings without user impact

---

## Disclosure Policy

Please allow a reasonable amount of time for investigation and remediation before public disclosure.

Responsible disclosure helps protect users, maintainers, and the wider community.

---

## Security Notes for Contributors

When working on Rizzzler, please keep security in mind:

- never commit `.env` files or secrets
- avoid unsafe direct string interpolation into SQL, database queries, or HTML output
- validate user-controlled input in dashboard/profile flows
- fix privilege issues before merging feature work
- apply least-privilege patterns for admin-only routes and middleware

---

Thank you for helping keep Rizzzler safe and secure. ❤️
