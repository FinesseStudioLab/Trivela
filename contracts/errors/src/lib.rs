//! Shared error-code ranges for Trivela Soroban contracts (#1192).
//!
//! Every contract's `#[contracterror]` enum must keep its discriminants
//! inside the range reserved for it below, so an `Error(Contract, #N)` seen
//! by a client, indexer or explorer identifies both the failing contract and
//! the reason without extra context.
//!
//! | Range     | Contract                      |
//! |-----------|-------------------------------|
//! | 1–99      | rewards (`trivela-rewards`)   |
//! | 100–199   | campaign                      |
//! | 200–299   | nullifier registry            |
//! | 300–399   | badges (reserved)             |
//! | 400–499   | voting (reserved)             |
//! | 500–899   | reserved for future contracts |
//! | 900–999   | shared / cross-contract codes |
//!
//! Existing codes are never renumbered once deployed; new variants are
//! appended within the owning range. The crate is `no_std` and has no
//! Soroban dependency, so it can be used from contracts, tests and tooling.
#![no_std]

use core::ops::RangeInclusive;

/// A contract that owns a block of error codes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContractDomain {
    Rewards,
    Campaign,
    Nullifiers,
    Badges,
    Voting,
    Shared,
}

pub const REWARDS: RangeInclusive<u32> = 1..=99;
pub const CAMPAIGN: RangeInclusive<u32> = 100..=199;
pub const NULLIFIERS: RangeInclusive<u32> = 200..=299;
pub const BADGES: RangeInclusive<u32> = 300..=399;
pub const VOTING: RangeInclusive<u32> = 400..=499;
pub const SHARED: RangeInclusive<u32> = 900..=999;

/// Every domain, in ascending code order.
pub const ALL_DOMAINS: [ContractDomain; 6] = [
    ContractDomain::Rewards,
    ContractDomain::Campaign,
    ContractDomain::Nullifiers,
    ContractDomain::Badges,
    ContractDomain::Voting,
    ContractDomain::Shared,
];

impl ContractDomain {
    /// The inclusive code range reserved for this domain.
    pub const fn range(self) -> RangeInclusive<u32> {
        match self {
            ContractDomain::Rewards => REWARDS,
            ContractDomain::Campaign => CAMPAIGN,
            ContractDomain::Nullifiers => NULLIFIERS,
            ContractDomain::Badges => BADGES,
            ContractDomain::Voting => VOTING,
            ContractDomain::Shared => SHARED,
        }
    }

    /// Whether `code` is inside this domain's range.
    pub const fn contains(self, code: u32) -> bool {
        let range = self.range();
        code >= *range.start() && code <= *range.end()
    }

    /// Stable lowercase name, e.g. for logs and client-side lookups.
    pub const fn name(self) -> &'static str {
        match self {
            ContractDomain::Rewards => "rewards",
            ContractDomain::Campaign => "campaign",
            ContractDomain::Nullifiers => "nullifiers",
            ContractDomain::Badges => "badges",
            ContractDomain::Voting => "voting",
            ContractDomain::Shared => "shared",
        }
    }
}

/// Resolve which contract owns an error code, or `None` for an unassigned code.
pub const fn domain_of(code: u32) -> Option<ContractDomain> {
    let mut i = 0;
    while i < ALL_DOMAINS.len() {
        if ALL_DOMAINS[i].contains(code) {
            return Some(ALL_DOMAINS[i]);
        }
        i += 1;
    }
    None
}

/// Assert, for use in each contract's tests, that every discriminant of its
/// error enum sits inside the contract's reserved range.
///
/// ```ignore
/// trivela_contract_errors::assert_codes_in_domain(
///     ContractDomain::Campaign,
///     &[Error::Unauthorized as u32, Error::InAddressBlocklist as u32],
/// );
/// ```
pub fn assert_codes_in_domain(domain: ContractDomain, codes: &[u32]) {
    for &code in codes {
        assert!(
            domain.contains(code),
            "error code {} is outside the {} range {:?}",
            code,
            domain.name(),
            domain.range()
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges_are_ordered_and_disjoint() {
        for pair in ALL_DOMAINS.windows(2) {
            assert!(pair[0].range().end() < pair[1].range().start());
        }
    }

    #[test]
    fn domain_lookup() {
        assert_eq!(domain_of(0), None);
        assert_eq!(domain_of(1), Some(ContractDomain::Rewards));
        assert_eq!(domain_of(99), Some(ContractDomain::Rewards));
        assert_eq!(domain_of(100), Some(ContractDomain::Campaign));
        assert_eq!(domain_of(200), Some(ContractDomain::Nullifiers));
        assert_eq!(domain_of(450), Some(ContractDomain::Voting));
        assert_eq!(domain_of(600), None);
        assert_eq!(domain_of(999), Some(ContractDomain::Shared));
        assert_eq!(domain_of(1000), None);
    }

    #[test]
    #[should_panic(expected = "outside the campaign range")]
    fn assert_codes_in_domain_rejects_out_of_range() {
        assert_codes_in_domain(ContractDomain::Campaign, &[100, 5]);
    }
}
