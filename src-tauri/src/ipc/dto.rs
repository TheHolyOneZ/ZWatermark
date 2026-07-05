

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentitySummary {
    pub id: String,
    pub display_name: String,
    pub email: Option<String>,
    pub verifying_key_hex: String,
    pub created_epoch_s: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_device_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSummary {
    pub id: String,
    pub name: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind_label: Option<String>,
    #[serde(default)]
    pub metadata: std::collections::BTreeMap<String, String>,
    pub created_epoch_s: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRef {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind_label: Option<String>,
    #[serde(default)]
    pub metadata: std::collections::BTreeMap<String, String>,
    pub known_locally: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkResult {
    pub output_path: String,
    pub bytes: u64,
    pub duration_ms: u32,
    pub strength: String,
    pub payload_bits: u32,


    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidecar_path: Option<String>,


    #[serde(default)]
    pub timestamps_obtained: u32,

    #[serde(default)]
    pub timestamp_errors: Vec<TimestampErrorInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampErrorInfo {
    pub tsa_url: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginatorInfo {
    pub id: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    pub verifying_key_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RobustPayloadInfo {
    pub version: u8,
    pub user_id_hex: String,
    pub device_id_hex: String,
    pub epoch_min: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub epoch_iso: Option<String>,
    pub counter: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FragileRegion {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FragilePayloadInfo {

    pub pubkey_hex: String,
    pub timestamp_ns: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub screen_serial: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region: Option<FragileRegion>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,
    pub signature_hex: String,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfContainedVerificationInfo {
    pub pubkey_hex: String,
    pub signature_ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub known_identity: Option<OriginatorInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rfc3161TimestampInfo {
    pub tsa_url: String,
    pub verified: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gen_time_iso: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gen_time_epoch_s: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarVerificationInfo {
    pub sidecar_path: String,


    pub digest_matches: bool,
    pub rfc3161: Vec<Rfc3161TimestampInfo>,
    #[serde(default)]
    pub opentimestamps: Vec<OpenTimestampsInfo>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenTimestampsInfo {
    pub calendar_url: String,


    pub verified: bool,


    pub pending_upgrade: bool,

    pub attestations: Vec<OtsAttestationInfo>,

    #[serde(default)]
    pub pending_calendars: Vec<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtsAttestationInfo {
    pub chain: String,
    pub height: u64,
    pub verified: bool,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_time_epoch_s: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_time_iso: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResult {
    pub found: bool,
    pub signature_ok: bool,


    pub identity_verified: bool,
    pub confidence: f32,
    pub robust_found: bool,
    pub fragile_found: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub originator: Option<OriginatorInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<DeviceRef>,
    pub timestamp_iso: Option<String>,
    pub payload_hex: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub robust_payload: Option<RobustPayloadInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fragile_payload: Option<FragilePayloadInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub self_contained: Option<SelfContainedVerificationInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidecar: Option<SidecarVerificationInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub enabled: bool,
    pub unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureLogEntry {
    pub id: String,
    pub path: String,
    pub thumbnail_data_url: Option<String>,
    pub epoch_ms: u64,
    pub strength: String,
    pub payload_bits: u32,
    pub verified: bool,
}
