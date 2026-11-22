//! Error codes must stay inside this contract's reserved range (#1192).
use crate::Error;
use trivela_contract_errors::{assert_codes_in_domain, ContractDomain};

#[test]
fn error_codes_are_in_campaign_range() {
    assert_codes_in_domain(
        ContractDomain::Campaign,
        &[
            Error::Unauthorized as u32,
            Error::OutsideTimeWindow as u32,
            Error::CapReached as u32,
            Error::CampaignInactive as u32,
            Error::NotInAllowlist as u32,
            Error::UnsupportedMigration as u32,
            Error::InvalidAdminNonce as u32,
            Error::InvalidWindow as u32,
            Error::NoPendingAdmin as u32,
            Error::SelfReferral as u32,
            Error::ReferrerNotRegistered as u32,
            Error::InvalidPrivacyMode as u32,
            Error::InvalidProof as u32,
            Error::NullifierAlreadyUsed as u32,
            Error::InviteCodeRequired as u32,
            Error::InvalidInviteCode as u32,
            Error::InviteAlreadyUsed as u32,
            Error::InviteNotFound as u32,
            Error::InvalidThreshold as u32,
            Error::InsufficientSignatures as u32,
            Error::NonceReused as u32,
            Error::DuplicateSigner as u32,
            Error::UnknownSigner as u32,
            Error::ReferralLoop as u32,
            Error::ReferralLocked as u32,
            Error::NotInAddressAllowlist as u32,
            Error::InAddressBlocklist as u32,
        ],
    );
}
