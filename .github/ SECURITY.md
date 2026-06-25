# Security Policy

## Supported Versions

The following versions are currently supported with security updates:

| Version        | Supported |
| -------------- | --------- |
| Main branch    | ✅        |
| Latest release | ✅        |
| Older releases | ❌        |

---

## Reporting a Vulnerability

Please do not create a public GitHub issue for security vulnerabilities.

Use one of the following channels:

1. GitHub Private Vulnerability Reporting
2. [security@trivela.io](mailto:security@trivela.io)

If private reporting is enabled:

https://github.com/FinesseStudioLab/Trivela/security/advisories/new

Include:

- Vulnerability description
- Reproduction steps
- Impact assessment
- Suggested remediation (optional)

---

## Response SLA

We aim to:

- Acknowledge reports within 48 hours
- Provide status updates during investigation
- Resolve critical vulnerabilities as quickly as possible

Standard coordinated disclosure timeline:

- Up to 90 days before public disclosure

---

## In Scope

### Smart Contracts

- Unauthorized token transfers
- Reward manipulation
- Contract privilege escalation
- Funds-at-risk vulnerabilities

### Backend

- Authentication bypass
- Authorization flaws
- Data exposure
- Remote code execution

### Frontend

- XSS
- CSRF
- Injection vulnerabilities
- Wallet-security issues

---

## Out of Scope

- Testnet denial-of-service attacks
- Social engineering
- Missing best practices without exploitability
- Vulnerabilities in third-party services outside Trivela control

---

## Safe Harbor

We support good-faith security research.

Researchers acting responsibly and following this policy will not be subject to legal action for
testing and reporting vulnerabilities.
