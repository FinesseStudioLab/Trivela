//! Error codes must stay inside this contract's reserved range (#1192).
use crate::Error;
use trivela_contract_errors::{assert_codes_in_domain, ContractDomain};

#[test]
fn error_codes_are_in_nullifiers_range() {
    assert_codes_in_domain(
        ContractDomain::Nullifiers,
        &[
            Error::AlreadySpent as u32,
            Error::Unauthorized as u32,
            Error::NotInitialized as u32,
        ],
    );
}
