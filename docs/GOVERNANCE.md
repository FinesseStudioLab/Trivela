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
