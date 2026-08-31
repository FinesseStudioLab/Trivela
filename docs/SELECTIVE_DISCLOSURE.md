# Selective Disclosure / View Keys for Compliance (#943)

> **Status:** Design stub — implementation tracked in issue #943.

## Summary

Regulated deployments must allow an auditor (or the user themselves) to reveal specific private
records without breaking global privacy. This document defines the design, threat model, and
acceptance criteria for a user-controlled selective disclosure mechanism.

---

## Design

### Core concept

Each private record (e.g., reward claim, campaign participation event) is encrypted with a symmetric
key `K_record` derived from the user's master view key `VK_user`:

```
K_record = KDF(VK_user, record_id)
```

Disclosing a record means sharing the one-time key `K_record` (derived from `VK_user` and
`record_id`), not the master key. An auditor who receives `K_record` can decrypt exactly that record
and nothing else.

### Key hierarchy

```
VK_user (held by user, never leaves their device)
   └─ K_record_1 = KDF(VK_user, "claim:abc")
   └─ K_record_2 = KDF(VK_user, "campaign:xyz:ref:0042")
   └─ …
```

### Scoped disclosure

A disclosure package contains:

```json
{
  "record_id": "claim:abc",
  "record_key": "<hex K_record>",
  "expires_at": "2026-08-31T00:00:00Z",
  "authorized_to": ["auditor@example.com"],
  "signature": "<user's wallet sig over the above fields>"
}
```

The backend verifies the signature before granting the auditor access.

---

## Threat model

| Threat                                           | Mitigation                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| Auditor reads records beyond the disclosed scope | Each `K_record` decrypts only one record; no path to `VK_user`         |
| Disclosure package forged by a third party       | Package is signed by the user's Stellar keypair; backend verifies      |
| Stale disclosure (reuse after audit window)      | `expires_at` enforced server-side; packages rejected after expiry      |
| User denies having disclosed                     | On-chain hash of disclosure package committed by user at time of grant |
| Backend impersonation                            | Disclosure package is verified client-side against known server pubkey |

---

## Acceptance Criteria (from issue #943)

- [ ] View keys reveal only the record(s) explicitly included in the disclosure package
- [ ] Disclosure is authorized by the user's Stellar wallet signature
- [ ] Threat model documented here and reviewed by security lead
- [ ] Integration test: auditor with valid package can read record; auditor without package cannot
- [ ] Package expiry enforced server-side; expired packages return `403 DISCLOSURE_EXPIRED`

---

## Implementation notes

- KDF: HKDF-SHA256 (`hkdf` crate or Web Crypto `deriveBits`)
- Record encryption: AES-256-GCM with per-record nonce
- View key transport: out-of-band (email, secure messenger); not stored on server
- Smart contract integration: contract stores only `record_commitment = Hash(ciphertext)`;
  decryption happens off-chain by the auditor
