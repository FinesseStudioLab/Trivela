# Trivela RFCs

This directory contains **Request for Comments** (RFC) documents that describe
significant changes to Trivela — new features, breaking changes, architectural
decisions, and anything else that benefits from broader discussion before
implementation begins.

## When to write an RFC

Write an RFC for changes that are:

- **Additive but significant** — a new contract interface, a new API surface, or
  a new user-facing feature that other contributors will build on.
- **Breaking** — any change that removes, renames, or alters the semantics of an
  existing public API, storage layout, or on-chain data structure.
- **Architectural** — a decision that shapes how components fit together and
  would be costly to reverse later (e.g. storage model, authentication scheme,
  cross-contract call patterns).

You do **not** need an RFC for:

- Bug fixes that do not change public behaviour.
- Internal refactors that have no user-visible effects.
- Documentation updates.
- Minor additions (e.g. a new optional field that is fully backwards-compatible).

If you are unsure, open a GitHub Discussion first and ask — maintainers will
tell you whether an RFC is needed.

## RFC lifecycle

```
Proposed → Under Review → Accepted / Rejected / Deferred
                                ↓
                          Implementation
                                ↓
                           Merged / Closed
```

| Status | Meaning |
|--------|---------|
| **Proposed** | Author has opened a PR with the RFC document. |
| **Under Review** | Maintainers and community are actively discussing the PR. |
| **Accepted** | The RFC PR has been merged; implementation may begin. |
| **Rejected** | The proposal was declined; the PR is closed with a reason. |
| **Deferred** | The idea is sound but not prioritised right now; may be reopened. |

An RFC is considered **superseded** when a later RFC explicitly replaces it.
Both documents remain in the directory; the superseded one notes the successor.

## How to submit an RFC

1. **Copy the template.**

   ```bash
   cp docs/rfcs/0000-template.md docs/rfcs/0000-my-feature.md
   ```

2. **Fill in the template.** Replace every placeholder:
   - Change `0000` to the next available number (look at existing files).
   - Set the **Status** to `Proposed`.
   - Set the **Date** to today (ISO 8601: `YYYY-MM-DD`).
   - Write a clear **Summary**, **Motivation**, and **Detailed Design**.
   - Leave **Unresolved Questions** for things you want explicit feedback on.

3. **Open a pull request** against `main`.
   - Title: `rfc: <short description>`
   - Link any related issues or discussions in the PR body.

4. **Engage with feedback.** Address comments by pushing commits to the RFC
   branch. Major revisions should update the **Date** field.

5. **Wait for a decision.** A maintainer will mark the RFC Accepted, Rejected,
   or Deferred and merge or close the PR accordingly.

## Numbering

RFCs are numbered sequentially. Use the next integer after the highest existing
file (e.g. if `0004-*.md` is the latest, your file is `0005-my-feature.md`).
The `0000-template.md` file is not counted.

## Template

The RFC template lives at [0000-template.md](0000-template.md). It includes
sections for Summary, Motivation, Detailed Design, Drawbacks, Alternatives,
Unresolved Questions, and Implementation Plan.

## Existing RFCs

| Number | Title | Status |
|--------|-------|--------|
| (none yet — be the first!) | | |

Update this table when you open an RFC PR that gets merged.
