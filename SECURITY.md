# Security Policy & Bug Bounty Program

Trivela is committed to maintaining the highest security standards for financial safety, reserve integrity, smart contract execution, and backend data protection. We operate a formal bug bounty program and deeply appreciate responsible vulnerability disclosure from security researchers.

---

## Supported Versions

| Component / Branch | Supported Versions | Security Status |
| :--- | :--- | :--- |
| `main` (Production Branch) | Current Release | :white_check_mark: Active Security Maintenance |
| Soroban Contracts (`/contracts/`, `/soroban/`) | `>= 0.8.0` | :white_check_mark: Active Audit & Hotfix Coverage |
| Backend Services (`/backend/`) | `>= 1.0.0` | :white_check_mark: Active Security Maintenance |
| Client SDK & Frontend (`/sdk/`, `/frontend/`) | Current Release | :white_check_mark: Active Security Maintenance |
| Legacy / Deprecated Branches | Prior Releases | :x: Unsupported (Upgrade Required) |

---

## Reporting a Vulnerability

If you discover a security vulnerability in Trivela, please report it responsibly. **Do NOT** open a public GitHub issue or pull request before the vulnerability is resolved.

### Reporting Channels
1. **GitHub Private Security Advisory**: Open a private draft at [Trivela Security Advisories](https://github.com/FinesseStudioLab/Trivela/security/advisories/new).
2. **Encrypted Security Email**: Contact the security team at **`security@finessestudiolab.com`** with subject line `[SECURITY DISCLOSURE] <Component/Title>`.

### Report Requirements
To help us triage and validate your report swiftly, please provide:
- Detailed description of the vulnerability and its potential attack vector.
- Step-by-step reproduction instructions or a minimal reproducible Proof of Concept (PoC).
- Impact assessment on funds, reserves, authentication tokens, or contract state.
- Suggested architectural remediation or defensive patch (if available).

---

## Bug Bounty Reward Program

We offer structured financial rewards for verified vulnerabilities based on CVSS v3.1 severity scores and financial impact on the ecosystem:

| Severity Tier | CVSS v3.1 Score | Impact Scope | Reward Tier (USD / Equivalent) |
| :--- | :--- | :--- | :--- |
| **Critical** | `9.0 – 10.0` | Direct theft/drain of user/reserve funds, arbitrary contract balance takeover, critical auth bypass | **$2,500 – $5,000+** |
| **High** | `7.0 – 8.9` | Contract execution halt causing fund lockup, privilege escalation to admin/signer, sensitive credential leak | **$1,000 – $2,500** |
| **Medium** | `4.0 – 6.9` | Gas/rent exhaustion attacks, logic flaws bypassing defensive limits, unauthorized access to user metadata | **$300 – $1,000** |
| **Low / Informational** | `0.1 – 3.9` | Minor information disclosure, non-exploitable edge-case inconsistencies, defensive hardening | **$100 – $300** |

---

## Scope & Safe Harbor

### In-Scope
- Smart contracts (`/contracts/`, `/soroban/`)
- Backend API and auth middleware (`/backend/`)
- SDK and cryptographic signing libraries (`/sdk/`)
- Frontend application boundaries (`/frontend/`)

### Out-of-Scope
- Denial of Service (DoS/DDoS) targeting public endpoints without state corruption
- Social engineering, phishing, or physical attacks
- Issues in third-party RPC providers or external node infrastructure

### Safe Harbor
Trivela will not pursue legal action against security researchers who report vulnerabilities in good faith and adhere to responsible disclosure principles.

---

## SLA & Response Time
- **Initial Acknowledgment**: Within **24 to 48 hours**.
- **Triage & Validation**: Within **5 business days**.
- **Fix Deployment & Bounty Payout**: Immediate post-validation and coordinated release.
