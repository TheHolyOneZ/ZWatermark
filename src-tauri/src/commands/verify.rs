use crate::activity::{ActivityLevel, ActivitySource};
use crate::ipc::dto::{
    DeviceRef, FragilePayloadInfo, FragileRegion, OpenTimestampsInfo, OriginatorInfo,
    OtsAttestationInfo, Rfc3161TimestampInfo, RobustPayloadInfo, SelfContainedVerificationInfo,
    SidecarVerificationInfo, VerifyResult,
};
use crate::state::AppState;
use chrono::TimeZone;
use std::path::Path;
use tauri::State;
use zwatermark_core::device::DeviceKind;
use zwatermark_core::identity::KeyRing;
use zwatermark_core::sidecar;
use zwatermark_core::store::{self, DeviceStore, IdentityStore};
use zwatermark_core::timestamp::{
    self, ots, BlockHeaderOracle, EsploraOracle, OtsBlockVerification,
};

fn kind_to_str(k: DeviceKind) -> &'static str {
    match k {
        DeviceKind::Workstation => "workstation",
        DeviceKind::Laptop => "laptop",
        DeviceKind::Camera => "camera",
        DeviceKind::Phone => "phone",
        DeviceKind::Server => "server",
        DeviceKind::Custom => "custom",
    }
}

fn kind_label(k: DeviceKind) -> &'static str {
    match k {
        DeviceKind::Workstation => "Workstation",
        DeviceKind::Laptop => "Laptop",
        DeviceKind::Camera => "Camera",
        DeviceKind::Phone => "Phone",
        DeviceKind::Server => "Server",
        DeviceKind::Custom => "Custom",
    }
}

#[tauri::command]
pub async fn verify_image(
    state: State<'_, AppState>,
    path: String,
) -> Result<VerifyResult, String> {
    let path_c = path.clone();
    let outcome =
        tokio::task::spawn_blocking(move || -> Result<VerifyResult, String> {
            let img = image::open(&path_c).map_err(|e| e.to_string())?;

            let store_path = store::default_identity_path().map_err(|e| e.to_string())?;
            let store = IdentityStore::load(&store_path).map_err(|e| e.to_string())?;

            let mut ring = KeyRing::new();
            for s in &store.identities {
                if let Ok(pub_id) = s.to_public() {
                    ring.insert(pub_id);
                }
            }

            let device_store_path = store::default_devices_path().map_err(|e| e.to_string())?;
            let device_store = DeviceStore::load(&device_store_path).unwrap_or_default();

            let result = zwatermark_core::verify(&img, &ring).map_err(|e| e.to_string())?;

            let originator = result.originator.as_ref().map(|o| OriginatorInfo {
                id: o.id.to_string(),
                display_name: o.display_name.clone(),
                email: o.email.clone(),
                verifying_key_hex: hex::encode(o.verifying_key),
            });

            let embedded_name = result.fragile.as_ref().and_then(|f| f.device_name.clone());
            let local_device = result
                .robust
                .as_ref()
                .and_then(|r| device_store.find_by_id_bits(r.device_id));
            let device: Option<DeviceRef> = match (local_device, embedded_name) {
                (Some(d), _) => Some(DeviceRef {
                    name: d.name.clone(),
                    id: Some(d.id.to_string()),
                    kind: Some(kind_to_str(d.kind).to_string()),
                    kind_label: d
                        .kind_label
                        .clone()
                        .or_else(|| Some(kind_label(d.kind).to_string())),
                    metadata: d.metadata.clone(),
                    known_locally: true,
                }),
                (None, Some(name)) => Some(DeviceRef {
                    name,
                    id: None,
                    kind: None,
                    kind_label: None,
                    metadata: Default::default(),
                    known_locally: false,
                }),
                (None, None) => None,
            };

            let timestamp_iso = result.fragile.as_ref().and_then(|f| {
                let secs = (f.timestamp_ns / 1_000_000_000) as i64;
                chrono::Utc
                    .timestamp_opt(secs, 0)
                    .single()
                    .map(|dt| dt.to_rfc3339())
            });

            let payload_hex = result.robust.as_ref().map(|p| hex::encode(p.to_bits()));

            let robust_payload = result.robust.as_ref().map(|r| {
                let epoch_secs = (r.epoch_min as i64).saturating_mul(60);
                let epoch_iso = chrono::Utc
                    .timestamp_opt(epoch_secs, 0)
                    .single()
                    .map(|dt| dt.to_rfc3339());
                RobustPayloadInfo {
                    version: r.version,
                    user_id_hex: hex::encode(r.user_id),
                    device_id_hex: hex::encode(r.device_id),
                    epoch_min: r.epoch_min,
                    epoch_iso,
                    counter: r.counter,
                }
            });

            let fragile_payload = result.fragile.as_ref().map(|f| FragilePayloadInfo {
                pubkey_hex: hex::encode(f.pubkey),
                timestamp_ns: f.timestamp_ns.to_string(),
                screen_serial: f.screen_serial.clone(),
                region: f.region.as_ref().map(|r| FragileRegion {
                    x: r.x,
                    y: r.y,
                    w: r.w,
                    h: r.h,
                }),
                device_name: f.device_name.clone(),
                signature_hex: hex::encode(f.signature),
            });

            let self_contained = result.self_contained.as_ref().map(|sc| {
                SelfContainedVerificationInfo {
                    pubkey_hex: hex::encode(sc.pubkey),
                    signature_ok: sc.signature_ok,
                    known_identity: sc.known_identity.as_ref().map(|k| OriginatorInfo {
                        id: k.id.to_string(),
                        display_name: k.display_name.clone(),
                        email: k.email.clone(),
                        verifying_key_hex: hex::encode(k.verifying_key),
                    }),
                }
            });

            let sidecar_info = read_sidecar_verification(Path::new(&path_c));

            let robust_found = result.robust.is_some();
            let fragile_found = result.fragile.is_some();

            Ok(VerifyResult {
                found: robust_found || fragile_found,
                signature_ok: result.signature_ok,
                identity_verified: result.identity_verified,
                confidence: result.confidence,
                robust_found,
                fragile_found,
                originator,
                device,
                timestamp_iso,
                payload_hex,
                robust_payload,
                fragile_payload,
                self_contained,
                sidecar: sidecar_info,
            })
        })
        .await
        .map_err(|e| e.to_string())?;

    match &outcome {
        Ok(r) => {
            let (level, msg) = if r.found && r.signature_ok {
                (
                    ActivityLevel::Success,
                    format!(
                        "Verified: signature OK ({:.0}% confidence)",
                        (r.confidence * 100.0).clamp(0.0, 100.0),
                    ),
                )
            } else if r.found {
                (
                    ActivityLevel::Warning,
                    "Watermark found but signature did not verify".to_string(),
                )
            } else {
                (
                    ActivityLevel::Info,
                    "Verified: no watermark found".to_string(),
                )
            };
            state.log(level, ActivitySource::Verify, msg, Some(path.clone()));
        }
        Err(e) => state.log(
            ActivityLevel::Error,
            ActivitySource::Verify,
            format!("Verify failed for {path}"),
            Some(e.clone()),
        ),
    }
    outcome
}


pub fn read_sidecar_verification(image_path: &Path) -> Option<SidecarVerificationInfo> {
    let sidecar_path = sidecar::sidecar_path_for(image_path);
    let sc = sidecar::read_sidecar_next_to(image_path).ok().flatten()?;

    let actual_digest = sidecar::image_digest_from_path(image_path).ok();
    let digest_matches = actual_digest
        .as_ref()
        .map(|d| d == &sc.image_digest_sha256)
        .unwrap_or(false);


    let rfc3161: Vec<Rfc3161TimestampInfo> = sc
        .timestamps
        .rfc3161_tokens
        .iter()
        .map(|tok| match timestamp::verify_rfc3161(tok, &sc.image_digest_sha256) {
            Ok(v) => Rfc3161TimestampInfo {
                tsa_url: v.tsa_url,
                verified: true,
                gen_time_iso: Some(v.gen_time_iso),
                gen_time_epoch_s: Some(v.gen_time_epoch_s),
                error: None,
            },
            Err(e) => Rfc3161TimestampInfo {
                tsa_url: tok.tsa_url.clone(),
                verified: false,
                gen_time_iso: None,
                gen_time_epoch_s: None,
                error: Some(e.to_string()),
            },
        })
        .collect();

    let opentimestamps = verify_ots_receipts(&sc);

    Some(SidecarVerificationInfo {
        sidecar_path: sidecar_path.to_string_lossy().into_owned(),
        digest_matches,
        rfc3161,
        opentimestamps,
    })
}


fn verify_ots_receipts(sc: &sidecar::SidecarV1) -> Vec<OpenTimestampsInfo> {
    if sc.timestamps.ots_receipts.is_empty() {
        return Vec::new();
    }
    let oracle = EsploraOracle::default();
    sc.timestamps
        .ots_receipts
        .iter()
        .map(|r| verify_one_ots(r, &sc.image_digest_sha256, &oracle))
        .collect()
}

fn verify_one_ots(
    receipt: &timestamp::OtsReceipt,
    digest: &[u8; 32],
    oracle: &dyn BlockHeaderOracle,
) -> OpenTimestampsInfo {
    let proof = match ots::parse_proof(&receipt.proof_bytes) {
        Ok(p) => p,
        Err(e) => {
            return OpenTimestampsInfo {
                calendar_url: receipt.calendar_url.clone(),
                verified: false,
                pending_upgrade: false,
                attestations: Vec::new(),
                pending_calendars: Vec::new(),
                error: Some(e.to_string()),
            };
        }
    };
    let status = match timestamp::verify_ots(&proof, digest, oracle) {
        Ok(s) => s,
        Err(e) => {
            return OpenTimestampsInfo {
                calendar_url: receipt.calendar_url.clone(),
                verified: false,
                pending_upgrade: false,
                attestations: Vec::new(),
                pending_calendars: Vec::new(),
                error: Some(e.to_string()),
            };
        }
    };

    let attestations: Vec<OtsAttestationInfo> = status
        .block_attestations
        .iter()
        .map(|v| match v {
            OtsBlockVerification::Verified {
                chain,
                height,
                block_time_epoch_s,
            } => {
                let iso = block_time_epoch_s.and_then(|s| {
                    chrono::Utc
                        .timestamp_opt(s as i64, 0)
                        .single()
                        .map(|dt| dt.to_rfc3339())
                });
                OtsAttestationInfo {
                    chain: chain.as_str().to_string(),
                    height: *height,
                    verified: true,
                    block_time_epoch_s: *block_time_epoch_s,
                    block_time_iso: iso,
                    error: None,
                }
            }
            OtsBlockVerification::MerkleMismatch { chain, height } => OtsAttestationInfo {
                chain: chain.as_str().to_string(),
                height: *height,
                verified: false,
                block_time_epoch_s: None,
                block_time_iso: None,
                error: Some("merkle root did not match block header".to_string()),
            },
            OtsBlockVerification::OracleError {
                chain,
                height,
                error,
            } => OtsAttestationInfo {
                chain: chain.as_str().to_string(),
                height: *height,
                verified: false,
                block_time_epoch_s: None,
                block_time_iso: None,
                error: Some(error.clone()),
            },
        })
        .collect();

    OpenTimestampsInfo {
        calendar_url: receipt.calendar_url.clone(),
        verified: status.any_verified(),
        pending_upgrade: status.pending_only(),
        attestations,
        pending_calendars: status.pending_calendars,
        error: None,
    }
}
