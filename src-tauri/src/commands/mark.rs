use crate::activity::{ActivityLevel, ActivitySource};
use crate::ipc::dto::{CaptureLogEntry, MarkResult, TimestampErrorInfo};
use crate::state::AppState;
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::State;
use zwatermark_core::device::{device_id_bits_from_uuid, Device};
use zwatermark_core::overlay::VisibleOverlay;
use zwatermark_core::payload::{RobustPayload, Strength, CURRENT_VERSION};
use zwatermark_core::sidecar;
use zwatermark_core::store::{self, DeviceStore, IdentityStore};
use zwatermark_core::TimestampConfig;

#[tauri::command]
pub async fn mark_image(
    state: State<'_, AppState>,
    path: String,
    identity_id: String,
    device_id: Option<String>,
    strength: String,
    overlay: Option<VisibleOverlay>,
    request_timestamps: Option<bool>,
) -> Result<MarkResult, String> {
    let overlay_cfg = overlay.filter(|o| o.enabled);
    let sk = state
        .signing_keys
        .lock()
        .map_err(|e| e.to_string())?
        .get(&identity_id)
        .cloned();
    let signing_key = sk.ok_or("identity not found")?;

    let strength_flag = match strength.as_str() {
        "robust" => Strength::ROBUST,
        "fragile" => Strength::FRAGILE,
        "both" | "" => Strength::BOTH,
        "max" => Strength::MAX,
        other => return Err(format!("unknown strength: {other}")),
    };
    let strength_label = strength.clone();
    let captures = state.captures.clone();
    let path_for_log = path.clone();


    let ts_settings = state
        .settings
        .read()
        .map(|s| s.timestamps.clone())
        .map_err(|e| e.to_string())?;
    let request_ts = request_timestamps.unwrap_or(ts_settings.default_request);
    let ts_config = TimestampConfig {
        request_timestamps: request_ts,
        tsa_urls: if request_ts {
            ts_settings.tsa_urls.clone()
        } else {
            Vec::new()
        },
        ots_calendar_urls: if request_ts {
            ts_settings.ots_calendar_urls.clone()
        } else {
            Vec::new()
        },
    };

    let result = tokio::task::spawn_blocking(move || -> Result<MarkResult, String> {
        let start = Instant::now();

        let uuid = uuid::Uuid::parse_str(&identity_id).map_err(|e| e.to_string())?;
        let store_path = store::default_identity_path().map_err(|e| e.to_string())?;
        let store = IdentityStore::load(&store_path).map_err(|e| e.to_string())?;
        let stored = store.find(&uuid).ok_or("identity not found")?;

        let mut identity = stored.to_public().map_err(|e| e.to_string()).map(|pub_id| {
            zwatermark_core::identity::Identity {
                id: pub_id.id,
                display_name: pub_id.display_name,
                email: pub_id.email,
                signing_key: None,
                verifying_key: pub_id.verifying_key,
                created_epoch_s: stored.created_epoch_s,
            }
        })?;
        identity.signing_key = Some(signing_key);


        let device_store_path = store::default_devices_path().map_err(|e| e.to_string())?;
        let device_store = DeviceStore::load(&device_store_path).map_err(|e| e.to_string())?;
        let resolved_device_uuid: Option<uuid::Uuid> = match device_id {
            Some(s) if !s.is_empty() => Some(uuid::Uuid::parse_str(&s).map_err(|e| e.to_string())?),
            _ => stored.default_device_id,
        };
        let device: Option<&Device> = resolved_device_uuid.as_ref().and_then(|u| device_store.find(u));
        let device_bits = resolved_device_uuid.map(device_id_bits_from_uuid).unwrap_or([0, 0]);
        let device_name = device.map(|d| d.name.clone());

        let img = image::open(&path).map_err(|e| e.to_string())?;
        let payload = RobustPayload {
            version: CURRENT_VERSION,
            user_id: identity.user_id(),
            device_id: device_bits,
            epoch_min: zwatermark_core::current_epoch_min(),
            counter: 0,
        };

        let mark_out = zwatermark_core::mark_with_sidecar(
            &img,
            &payload,
            &identity,
            strength_flag,
            device_name.as_deref(),
            overlay_cfg.as_ref(),
            &ts_config,
        )
        .map_err(|e| e.to_string())?;
        let marked = mark_out.image;

        let src = PathBuf::from(&path);
        let out = src.with_file_name(format!(
            "{}.zw.png",
            src.file_stem().and_then(|s| s.to_str()).unwrap_or("out"),
        ));
        marked.save(&out).map_err(|e| e.to_string())?;
        let bytes = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);


        let (sidecar_path, timestamps_obtained) = if let Some(mut sc) = mark_out.sidecar {
            if sc.timestamps.is_empty() {
                (None, 0u32)
            } else {


                if let Ok(d) = sidecar::image_digest_from_path(&out) {
                    sc.image_digest_sha256 = d;
                }
                let obtained = sc.timestamps.rfc3161_tokens.len() as u32;
                match sidecar::write_sidecar(&out, &sc) {
                    Ok(p) => (Some(p.to_string_lossy().into_owned()), obtained),
                    Err(_) => (None, obtained),
                }
            }
        } else {
            (None, 0u32)
        };

        let timestamp_errors: Vec<TimestampErrorInfo> = mark_out
            .timestamp_errors
            .into_iter()
            .map(|(tsa_url, message)| TimestampErrorInfo { tsa_url, message })
            .collect();

        let epoch_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let entry = CaptureLogEntry {
            id: uuid::Uuid::new_v4().to_string(),
            path: out.to_string_lossy().into_owned(),
            thumbnail_data_url: None,
            epoch_ms,
            strength: strength_label.clone(),
            payload_bits: 128,
            verified: true,
        };
        if let Ok(mut guard) = captures.lock() {
            if guard.len() == 200 { guard.pop_back(); }
            guard.push_front(entry.clone());
        }

        Ok(MarkResult {
            output_path: out.to_string_lossy().into_owned(),
            bytes,
            duration_ms: start.elapsed().as_millis() as u32,
            strength: strength_label,
            payload_bits: 128,
            sidecar_path,
            timestamps_obtained,
            timestamp_errors,
        })
    })
    .await
    .map_err(|e| e.to_string())?;

    match &result {
        Ok(r) => state.log(
            ActivityLevel::Success,
            ActivitySource::Mark,
            format!(
                "Marked screenshot ({}) in {} ms",
                if r.strength.is_empty() { "both" } else { r.strength.as_str() },
                r.duration_ms,
            ),
            Some(r.output_path.clone()),
        ),
        Err(e) => state.log(
            ActivityLevel::Error,
            ActivitySource::Mark,
            format!("Mark failed for {path_for_log}"),
            Some(e.clone()),
        ),
    }
    result
}
