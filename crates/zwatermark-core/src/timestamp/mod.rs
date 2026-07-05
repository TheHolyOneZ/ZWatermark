

pub mod ots;
pub mod rfc3161;

use serde::{Deserialize, Serialize};

pub use ots::{
    submit_ots, verify_ots, BlockHeaderOracle, Chain, EsploraOracle, OtsAttestation,
    OtsBlockVerification, OtsError, OtsProof, OtsReceipt, OtsStatus,
};
pub use rfc3161::{
    request_rfc3161, verify_rfc3161, Rfc3161Error, Rfc3161Token, VerifiedRfc3161,
};


#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TimestampBundle {
    #[serde(default)]
    pub rfc3161_tokens: Vec<Rfc3161Token>,
    #[serde(default)]
    pub ots_receipts: Vec<OtsReceipt>,
}

impl TimestampBundle {
    pub fn is_empty(&self) -> bool {
        self.rfc3161_tokens.is_empty() && self.ots_receipts.is_empty()
    }
}
