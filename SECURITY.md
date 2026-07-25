# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in Trivela, please report it responsibly by emailing **security@trivela.io** instead of using the public issue tracker.

**Please include:**
- A description of the vulnerability
- Steps to reproduce (if applicable)
- Potential impact assessment
- Any proof-of-concept (POC) code (optional but helpful)

We will acknowledge your report within 48 hours and work with you to understand and resolve the issue.

## Security Standards

Trivela follows these security practices:

- **Smart Contracts**: Deployed on Stellar Testnet with formal verification where possible
- **API Security**: Rate limiting, API key authentication, and CORS protection
- **Data Protection**: PII is minimized; sensitive operations require authentication
- **Dependencies**: Regular updates and vulnerability scanning via automated tools

## Scope

### In Scope

- Smart contract vulnerabilities (integer overflow, access control, logic flaws)
- API vulnerabilities (authentication bypass, authorization flaws, injection attacks)
- Cryptographic weaknesses
- Information disclosure issues
- Denial-of-service vulnerabilities with high impact

### Out of Scope

- Vulnerabilities in third-party dependencies (report to upstream maintainers)
- Social engineering or phishing attacks
- Issues requiring access to private infrastructure
- Minor UI/UX issues or styling inconsistencies
- Already disclosed vulnerabilities

## Rewards

While Trivela is an open-source project, we recognize the value of security research:

- Critical vulnerabilities: $5,000+ (negotiable based on impact)
- High severity: $1,000 - $5,000
- Medium severity: $500 - $1,000
- Low severity: $100 - $500

Rewards are offered at our discretion based on:
- Severity and exploitability
- Clarity and quality of the report
- Cooperation in resolution

## Responsible Disclosure Timeline

1. **Day 0**: Initial report received
2. **Day 1-2**: Triage and acknowledgment
3. **Day 30**: Expected patch/mitigation (varies by severity)
4. **Day 90**: Public disclosure permitted (unless active exploit)

We request a **90-day responsible disclosure window** before public disclosure, allowing time for fixes and deployment.

## Safe Harbor

We will not pursue legal action against researchers who:
- Report vulnerabilities in good faith
- Avoid accessing data beyond what's necessary to demonstrate the vulnerability
- Do not disrupt or degrade services
- Do not demand ransom or compensation
- Follow responsible disclosure practices

## Out-of-Band Communication

For particularly sensitive issues, researchers may request verification of their identity before disclosure. We use standard OpenPGP keys for encrypted communication (keys available upon request).

## Security Contact

- **Email**: security@trivela.io
- **GitHub Security Advisories**: [Create a private security advisory](https://github.com/FinesseStudioLab/Trivela/security/advisories)

---

**Last Updated**: 2025-07-25
