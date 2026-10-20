# Trivela Governance

This document outlines the governance process for proposing and approving changes to the Trivela
protocol, API, and architecture.

## Decision Types

### RFC Required (Request for Comments)

An RFC is required for the following types of changes:

- **Protocol changes**: Modifications to smart contract interfaces, storage layouts, or upgrade
  mechanisms
- **New contracts**: Addition of new Soroban smart contracts to the protocol
- **API breaking changes**: Changes to public API endpoints that would break existing integrations
- **Major architectural shifts**: Significant changes to the system architecture (e.g., switching
  from SQLite to PostgreSQL, changing the RPC pool strategy)

### ADR Required (Architecture Decision Record)

An ADR is required for significant architecture choices that don't require an RFC:

- **Technology choices**: Selection of new libraries, frameworks, or tools
- **Data model changes**: Non-breaking modifications to database schemas
- **Infrastructure changes**: Deployment, monitoring, or operational improvements
- **Performance optimizations**: Significant changes to caching, indexing, or query strategies

See [docs/adr/](adr/) for existing ADRs.

### PR Only

The following changes can be made via a standard pull request without an RFC or ADR:

- **Features**: New features that don't break existing APIs or change architecture
- **Bug fixes**: Fixes to bugs or issues
- **Documentation**: Updates to documentation, README, or guides
- **Tests**: Addition or modification of tests
- **Minor refactoring**: Code cleanup, style improvements, or non-architectural refactoring

## RFC Process

### 1. Raise a GitHub Discussion

Create a new GitHub Discussion in the **RFC** category with:

- A clear title describing the proposed change
- A link to the RFC document in `docs/rfcs/`
- A brief summary of the proposal

The RFC document should follow the template in `docs/rfcs/0000-template.md`.

### 2. 7-Day Feedback Window

The RFC is open for community feedback for a minimum of **7 days**. During this period:

- Anyone can comment on the RFC
- Core team members may ask clarifying questions
- The proposal may be revised based on feedback

### 3. Core Team Decision

After the feedback window closes, the core team will:

- Review all feedback
- Vote on the RFC (see Voting section below)
- Announce the decision in the GitHub Discussion
- Update the RFC status (Accepted / Rejected / Deferred)

### 4. Implementation

If accepted:

- The RFC author (or assignee) implements the change via a pull request
- The PR references the RFC discussion and document
- The RFC document is updated with implementation notes

## Core Team

The current core team members and their areas of responsibility:

| GitHub Username   | Area of Responsibility                                 |
| ----------------- | ------------------------------------------------------ |
| @FinesseStudioLab | Protocol design, smart contracts, overall architecture |
| @FinesseStudioLab | Backend API, database, infrastructure                  |
| @FinesseStudioLab | Frontend, UX, integration                              |

_Note: This is an initial list. The core team will be updated as the project grows._

## Voting

### Core Team Voting

Only core team members can vote on RFCs. Voting rules:

- **Non-breaking changes**: Simple majority (50% + 1 of voting core team members)
- **Breaking changes**: Unanimous consensus (all voting core team members must approve)
- **Abstentions**: Count as neither for nor against
- **Voting period**: 7 days after the feedback window closes

### Community Input

While only core team members can vote, community input is valued:

- Anyone can comment on RFCs during the feedback window
- Community votes (reactions) are advisory and non-binding
- Core team members must address significant community concerns before voting

## RFC Category

RFCs are discussed in the **RFC** category of GitHub Discussions:
https://github.com/FinesseStudioLab/Trivela/discussions/categories/rfc

## Related Documents

- [Architecture Decision Records (ADRs)](adr/) - For architectural choices
- [CONTRIBUTING.md](../CONTRIBUTING.md) - General contribution guidelines
- [README.md](../README.md) - Project overview and setup

## Quorum Requirements & Veto Rules

### Quorum Thresholds

All on-chain and off-chain governance proposals require a minimum participation quorum calculated as a percentage of the active circulating governance supply (`total_eligible_voting_weight`) at the proposal snapshot ledger:

| Proposal Category | Minimum Quorum (% of Circulating Supply) | Approval Threshold | Voting Window |
| :--- | :--- | :--- | :--- |
| **Standard Parameter Update** | **10%** (`1,000 bps`) | **> 50%** (`5,001 bps`) of cast votes | 7 days (`120,960` ledgers) |
| **Treasury / Reward Pool Allocation** | **20%** (`2,000 bps`) | **>= 60%** (`6,000 bps`) of cast votes | 7 days (`120,960` ledgers) |
| **Protocol Upgrade / Contract Migration** | **30%** (`3,000 bps`) | **>= 66.7%** (`6,667 bps`) supermajority | 10 days (`172,800` ledgers) |
| **Emergency Security Patch** | **15%** (`1,500 bps`) or Guardian Multisig | **>= 75%** (`7,500 bps`) supermajority | 48 hours (`34,560` ledgers) |

- **Abstentions**: Count toward **quorum participation** (`for_votes + against_votes + abstain_votes >= quorum_bps`), but are excluded from the approval ratio (`for_votes / (for_votes + against_votes)`).

### Veto Rules & Time-Lock Periods

1. **Mandatory Time-Lock Delay (`timelock_delay_ledgers`)**:
   - Every approved proposal enters a mandatory **48-hour time-lock window** (`34,560` ledgers at ~5s/ledger) before execution is permitted on-chain (`ProposalStatus::Queued -> ProposalStatus::Executed`).
   - Protocol upgrades and contract migrations require an extended **72-hour time-lock window** (`51,840` ledgers).
2. **Community & Security Veto Threshold (`veto_threshold_bps`)**:
   - If **>= 33.4% (`3,334 bps`)** of participating voting weight casts a `NoWithVeto` vote—or if the Security Council verifies a critical invariant violation during the time-lock window—the proposal is immediately transitioned to `ProposalStatus::Vetoed` and permanently cancelled before execution.
   - Proposals vetoed due to malicious behaviour or invariant violations forfeit their proposal deposit into the protocol reward reserve.

### On-Chain Voting Contract Parameters Cross-Reference

These governance rules map directly to the Soroban governance and campaign administration contract parameters:

- `quorum_bps: u32` — Minimum participation basis points (`1_000`–`3_000`, out of `10_000`).
- `approval_threshold_bps: u32` — Minimum affirmative vote basis points (`5_001`–`7_500`).
- `veto_threshold_bps: u32` — Veto trigger basis points (`3_334` = 33.34%).
- `voting_period_ledgers: u32` — Duration of active voting in Stellar ledgers.
- `timelock_delay_ledgers: u32` — Mandatory delay between proposal passage and on-chain execution.
