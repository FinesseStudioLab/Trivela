# Contributor reward attribution and leaderboard

Issue: [#885](https://github.com/FinesseStudioLab/Trivela/issues/885)

## Purpose

Make contributor impact **transparent** and connect the live campaign leaderboard to reward eligibility (including GrantFox OSS campaigns).

## What the leaderboard shows

| Field | Source | Notes |
| --- | --- | --- |
| Rank | `GET /api/v1/campaigns/:id/leaderboard` | Ordered by points |
| Wallet | Same API | Truncated in UI; full address available via search |
| Points | Campaign scoring | Earned via participation / claims per campaign rules |
| Claimed / net | API row fields | Shown when backend provides them |

UI: `frontend/src/CampaignLeaderboard.jsx` (route `/campaign/:id/leaderboard`).

## Attribution rules (transparent)

1. **On-campaign score** is authoritative for the in-app leaderboard and is not hand-edited.
2. **GrantFox rewards** require a merged PR that references an issue labeled for GrantFox (or an official campaign issue). Ranking high on the leaderboard alone does not auto-pay GrantFox.
3. **Dual credit is allowed** when the same work is both campaign-eligible and GrantFox-eligible; each rail has its own payout process.
4. **Disputes** use campaign admin tools + issue comments; scores refresh from the API on load/search.

## GrantFox integration

- Document campaign issues with GrantFox labels when a Trivela OSS bounty is funded.
- Link PRs with `Fixes #N` so attribution is recoverable from GitHub + leaderboard wallet identity.
- Prefer publishing the public receive wallet on the contributor profile for settlement.

## Updating the leaderboard

- Backend aggregation: campaign leaderboard endpoints (pagination, search `q`).
- Frontend: debounced search, infinite scroll / load more, connected-wallet rank banner.
- E2E: `frontend/tests/e2e/leaderboard.spec.js`.

## Acceptance map (#885)

| Criterion | Status |
| --- | --- |
| Leaderboard live and updated | Live via campaign API + UI |
| Attribution transparent | This doc + in-UI attribution panel |
| Link to reward eligibility | GrantFox rules section above |

