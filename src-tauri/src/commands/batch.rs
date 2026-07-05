

use crate::activity::{ActivityLevel, ActivitySource};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use zwatermark_core::device::device_id_bits_from_uuid;
use zwatermark_core::identity::KeyRing;
use zwatermark_core::overlay::VisibleOverlay;
use zwatermark_core::sidecar;
use zwatermark_core::store::{self, DeviceStore, IdentityStore};
use zwatermark_core::TimestampConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchVerifyRow {
    pub path: String,
    pub found: bool,
    pub signature_ok: bool,


    #[serde(default)]
    pub identity_verified: bool,
    pub confidence: f32,
    pub originator: Option<String>,
    pub device: Option<String>,
    pub timestamp_iso: Option<String>,
    pub blake3: String,
    pub error: Option<String>,

    #[serde(default)]
    pub has_sidecar: bool,

    #[serde(default)]
    pub sidecar_digest_matches: bool,

    #[serde(default)]
    pub timestamps_verified: u32,

    #[serde(default)]
    pub timestamps_total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchVerifyReport {
    pub folder: String,
    pub rows: Vec<BatchVerifyRow>,
    pub duration_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchMarkResult {
    pub processed: u32,
    pub failed: u32,
    pub duration_ms: u32,

    #[serde(default)]
    pub sidecars_written: u32,

    #[serde(default)]
    pub timestamps_obtained: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchStartResult {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchProgressPayload {
    job_id: String,
    phase: &'static str,
    processed: u64,
    total: u64,
    current_path: Option<String>,
    failed: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchDoneVerifyPayload {
    job_id: String,
    phase: &'static str,
    report: BatchVerifyReport,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchDoneMarkPayload {
    job_id: String,
    phase: &'static str,
    result: BatchMarkResult,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchErrorPayload {
    job_id: String,
    phase: &'static str,
    error: String,
}

fn walk_images(dir: &std::path::Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let allowed = ["png", "jpg", "jpeg", "webp", "bmp"];
    let Ok(rd) = std::fs::read_dir(dir) else { return out };
    for entry in rd.flatten() {
        let p = entry.path();
        if !p.is_file() { continue; }
        let ext = p.extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        if allowed.contains(&ext.as_str()) {
            out.push(p);
        }
    }
    out.sort();
    out
}

fn blake3_hex(path: &std::path::Path) -> String {
    use blake3::Hasher;
    let Ok(mut f) = std::fs::File::open(path) else { return String::new() };
    let mut hasher = Hasher::new();
    let _ = std::io::copy(&mut f, &mut hasher);
    hasher.finalize().to_hex().to_string()
}


fn register_job(state: &AppState) -> (String, Arc<AtomicBool>) {
    let id = uuid::Uuid::new_v4().to_string();
    let flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut guard) = state.batch_jobs.lock() {
        guard.insert(id.clone(), flag.clone());
    }
    (id, flag)
}


fn deregister_job(state_jobs: &Arc<std::sync::Mutex<std::collections::HashMap<String, Arc<AtomicBool>>>>, id: &str) {
    if let Ok(mut guard) = state_jobs.lock() {
        guard.remove(id);
    }
}

fn emit_progress(
    app: &AppHandle,
    job_id: &str,
    phase: &'static str,
    processed: u64,
    total: u64,
    current: Option<String>,
    failed: u64,
) {
    let _ = app.emit(
        "batch:progress",
        BatchProgressPayload {
            job_id: job_id.to_string(),
            phase,
            processed,
            total,
            current_path: current,
            failed,
        },
    );
}

fn emit_error(app: &AppHandle, job_id: &str, phase: &'static str, error: String) {
    let _ = app.emit(
        "batch:error",
        BatchErrorPayload {
            job_id: job_id.to_string(),
            phase,
            error: error.clone(),
        },
    );


    if let Some(state) = app.try_state::<AppState>() {
        state.log(
            ActivityLevel::Error,
            ActivitySource::Batch,
            format!("Batch {phase} failed"),
            Some(error),
        );
    }
}

#[tauri::command]
pub async fn batch_verify(
    app: AppHandle,
    state: State<'_, AppState>,
    folder: String,
) -> Result<BatchStartResult, String> {
    let (job_id, cancel) = register_job(&state);
    let jobs_registry = state.batch_jobs.clone();
    let job_id_task = job_id.clone();

    state.log(
        ActivityLevel::Info,
        ActivitySource::Batch,
        format!("Batch verify started: {folder}"),
        Some(format!("jobId={job_id}")),
    );

    let folder_for_log = folder.clone();

    tokio::task::spawn_blocking(move || {
        let phase = "verify";
        let started = std::time::Instant::now();
        let dir = PathBuf::from(&folder);


        let store_path = match store::default_identity_path() {
            Ok(p) => p,
            Err(e) => {
                emit_error(&app, &job_id_task, phase, e.to_string());
                deregister_job(&jobs_registry, &job_id_task);
                return;
            }
        };
        let id_store = match IdentityStore::load(&store_path) {
            Ok(s) => s,
            Err(e) => {
                emit_error(&app, &job_id_task, phase, e.to_string());
                deregister_job(&jobs_registry, &job_id_task);
                return;
            }
        };
        let mut ring = KeyRing::new();
        for s in &id_store.identities {
            if let Ok(pub_id) = s.to_public() {
                ring.insert(pub_id);
            }
        }

        let device_store_path = match store::default_devices_path() {
            Ok(p) => p,
            Err(e) => {
                emit_error(&app, &job_id_task, phase, e.to_string());
                deregister_job(&jobs_registry, &job_id_task);
                return;
            }
        };
        let device_store = DeviceStore::load(&device_store_path).unwrap_or_default();

        let paths = walk_images(&dir);
        let total = paths.len() as u64;


        emit_progress(&app, &job_id_task, phase, 0, total, None, 0);


        use rayon::prelude::*;
        use std::sync::atomic::AtomicU64;

        let processed = AtomicU64::new(0);
        let failed = AtomicU64::new(0);

        let mut rows: Vec<Option<BatchVerifyRow>> = (0..paths.len()).map(|_| None).collect();
        rows.par_iter_mut()
            .zip(paths.par_iter())
            .for_each(|(slot, path)| {
                if cancel.load(Ordering::SeqCst) {
                    return;
                }
                let path_str = path.to_string_lossy().into_owned();
                let p_now = processed.load(Ordering::Relaxed);
                let f_now = failed.load(Ordering::Relaxed);
                emit_progress(
                    &app,
                    &job_id_task,
                    phase,
                    p_now,
                    total,
                    Some(path_str.clone()),
                    f_now,
                );

                let sha = blake3_hex(path);
                let sidecar_info = crate::commands::verify::read_sidecar_verification(path);
                let (has_sidecar, sidecar_digest_matches, timestamps_verified, timestamps_total) =
                    match &sidecar_info {
                        Some(sc) => {
                            let ts_ok = sc.rfc3161.iter().filter(|t| t.verified).count() as u32
                                + sc.opentimestamps.iter().filter(|o| o.verified).count() as u32;
                            let ts_total =
                                sc.rfc3161.len() as u32 + sc.opentimestamps.len() as u32;
                            (true, sc.digest_matches, ts_ok, ts_total)
                        }
                        None => (false, false, 0, 0),
                    };
                let row = match image::open(path) {
                    Ok(img) => match zwatermark_core::verify(&img, &ring) {
                        Ok(res) => {
                            let originator = res.originator.as_ref().map(|o| o.display_name.clone());
                            let device: Option<String> = res
                                .fragile
                                .as_ref()
                                .and_then(|f| f.device_name.clone())
                                .or_else(|| {
                                    res.robust
                                        .as_ref()
                                        .and_then(|r| device_store.find_by_id_bits(r.device_id))
                                        .map(|d| d.name.clone())
                                });
                            let timestamp_iso = res.fragile.as_ref().and_then(|f| {
                                use chrono::TimeZone;
                                let secs = (f.timestamp_ns / 1_000_000_000) as i64;
                                chrono::Utc.timestamp_opt(secs, 0).single().map(|dt| dt.to_rfc3339())
                            });
                            BatchVerifyRow {
                                path: path_str,
                                found: res.robust.is_some() || res.fragile.is_some(),
                                signature_ok: res.signature_ok,
                                identity_verified: res.identity_verified,
                                confidence: res.confidence,
                                originator,
                                device,
                                timestamp_iso,
                                blake3: sha,
                                error: None,
                                has_sidecar,
                                sidecar_digest_matches,
                                timestamps_verified,
                                timestamps_total,
                            }
                        }
                        Err(e) => {
                            failed.fetch_add(1, Ordering::Relaxed);
                            BatchVerifyRow {
                                path: path_str,
                                found: false,
                                signature_ok: false,
                                identity_verified: false,
                                confidence: 0.0,
                                originator: None,
                                device: None,
                                timestamp_iso: None,
                                blake3: sha,
                                error: Some(e.to_string()),
                                has_sidecar,
                                sidecar_digest_matches,
                                timestamps_verified,
                                timestamps_total,
                            }
                        }
                    },
                    Err(e) => {
                        failed.fetch_add(1, Ordering::Relaxed);
                        BatchVerifyRow {
                            path: path_str,
                            found: false,
                            signature_ok: false,
                            identity_verified: false,
                            confidence: 0.0,
                            originator: None,
                            device: None,
                            timestamp_iso: None,
                            blake3: sha,
                            error: Some(e.to_string()),
                            has_sidecar,
                            sidecar_digest_matches,
                            timestamps_verified,
                            timestamps_total,
                        }
                    }
                };
                *slot = Some(row);
                let p = processed.fetch_add(1, Ordering::Relaxed) + 1;
                let f = failed.load(Ordering::Relaxed);
                emit_progress(&app, &job_id_task, phase, p, total, None, f);
            });

        let rows: Vec<BatchVerifyRow> = rows.into_iter().flatten().collect();
        let failed = failed.load(Ordering::Relaxed);

        let report = BatchVerifyReport {
            folder,
            rows,
            duration_ms: started.elapsed().as_millis() as u32,
        };

        let rows_len = report.rows.len();
        let cancelled = cancel.load(Ordering::SeqCst);
        if let Some(state) = app.try_state::<AppState>() {
            state.log(
                if cancelled { ActivityLevel::Warning } else { ActivityLevel::Success },
                ActivitySource::Batch,
                if cancelled {
                    format!("Batch verify cancelled ({rows_len} of {total} processed)")
                } else {
                    format!("Batch verify done: {rows_len} file(s), {failed} failed")
                },
                Some(folder_for_log.clone()),
            );
        }

        let _ = app.emit(
            "batch:done",
            BatchDoneVerifyPayload {
                job_id: job_id_task.clone(),
                phase,
                report,
            },
        );
        deregister_job(&jobs_registry, &job_id_task);
    });

    Ok(BatchStartResult { job_id })
}

#[tauri::command]
pub async fn batch_export_csv(
    report: BatchVerifyReport,
    destination: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || -> Result<String, String> {
        let mut wtr = csv::Writer::from_path(&destination).map_err(|e| e.to_string())?;
        wtr.write_record([
            "path", "found", "signature_ok", "confidence",
            "originator", "device", "timestamp_iso", "blake3", "error",
            "has_sidecar", "sidecar_digest_matches",
            "timestamps_verified", "timestamps_total",
        ]).map_err(|e| e.to_string())?;
        for r in &report.rows {
            wtr.write_record([
                r.path.as_str(),
                if r.found { "true" } else { "false" },
                if r.signature_ok { "true" } else { "false" },
                &format!("{:.4}", r.confidence),
                r.originator.as_deref().unwrap_or(""),
                r.device.as_deref().unwrap_or(""),
                r.timestamp_iso.as_deref().unwrap_or(""),
                r.blake3.as_str(),
                r.error.as_deref().unwrap_or(""),
                if r.has_sidecar { "true" } else { "false" },
                if r.sidecar_digest_matches { "true" } else { "false" },
                &r.timestamps_verified.to_string(),
                &r.timestamps_total.to_string(),
            ]).map_err(|e| e.to_string())?;
        }
        wtr.flush().map_err(|e| e.to_string())?;
        Ok(destination)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn batch_mark(
    app: AppHandle,
    state: State<'_, AppState>,
    folder: String,
    identity_id: String,
    device_id: Option<String>,
    strength: String,
    overlay: Option<VisibleOverlay>,
    request_timestamps: Option<bool>,
) -> Result<BatchStartResult, String> {
    let overlay_cfg = overlay.filter(|o| o.enabled);


    let sk = state
        .signing_keys
        .lock()
        .map_err(|e| e.to_string())?
        .get(&identity_id)
        .cloned()
        .ok_or("identity not found")?;

    let strength_flag = match strength.as_str() {
        "robust" => zwatermark_core::payload::Strength::ROBUST,
        "fragile" => zwatermark_core::payload::Strength::FRAGILE,
        "max" => zwatermark_core::payload::Strength::MAX,
        _ => zwatermark_core::payload::Strength::BOTH,
    };


    let ts_settings = state
        .settings
        .read()
        .map(|s| s.timestamps.clone())
        .map_err(|e| e.to_string())?;
    let request_ts = request_timestamps.unwrap_or(ts_settings.default_request);
    let ts_config = TimestampConfig {
        request_timestamps: request_ts,
        tsa_urls: if request_ts { ts_settings.tsa_urls.clone() } else { Vec::new() },
        ots_calendar_urls: if request_ts {
            ts_settings.ots_calendar_urls.clone()
        } else {
            Vec::new()
        },
    };

    let (job_id, cancel) = register_job(&state);
    let jobs_registry = state.batch_jobs.clone();
    let job_id_task = job_id.clone();

    state.log(
        ActivityLevel::Info,
        ActivitySource::Batch,
        format!("Batch mark started: {folder}"),
        Some(format!("jobId={job_id}, strength={strength}")),
    );
    let folder_for_log = folder.clone();

    tokio::task::spawn_blocking(move || {
        let phase = "mark";
        let started = std::time::Instant::now();
        let dir = PathBuf::from(&folder);

        let uuid = match uuid::Uuid::parse_str(&identity_id) {
            Ok(u) => u,
            Err(e) => {
                emit_error(&app, &job_id_task, phase, e.to_string());
                deregister_job(&jobs_registry, &job_id_task);
                return;
            }
        };
        let store_path = match store::default_identity_path() {
            Ok(p) => p,
            Err(e) => {
                emit_error(&app, &job_id_task, phase, e.to_string());
                deregister_job(&jobs_registry, &job_id_task);
                return;
            }
        };
        let id_store = match IdentityStore::load(&store_path) {
            Ok(s) => s,
            Err(e) => {
                emit_error(&app, &job_id_task, phase, e.to_string());
                deregister_job(&jobs_registry, &job_id_task);
                return;
            }
        };
        let stored = match id_store.find(&uuid) {
            Some(s) => s,
            None => {
                emit_error(&app, &job_id_task, phase, "identity not found".into());
                deregister_job(&jobs_registry, &job_id_task);
                return;
            }
        };

        let mut identity = match stored.to_public() {
            Ok(pub_id) => zwatermark_core::identity::Identity {
                id: pub_id.id,
                display_name: pub_id.display_name,
                email: pub_id.email,
                signing_key: None,
                verifying_key: pub_id.verifying_key,
                created_epoch_s: stored.created_epoch_s,
            },
            Err(e) => {
                emit_error(&app, &job_id_task, phase, e.to_string());
                deregister_job(&jobs_registry, &job_id_task);
                return;
            }
        };
        identity.signing_key = Some(sk);

        let device_store_path = match store::default_devices_path() {
            Ok(p) => p,
            Err(e) => {
                emit_error(&app, &job_id_task, phase, e.to_string());
                deregister_job(&jobs_registry, &job_id_task);
                return;
            }
        };
        let device_store = match DeviceStore::load(&device_store_path) {
            Ok(s) => s,
            Err(e) => {
                emit_error(&app, &job_id_task, phase, e.to_string());
                deregister_job(&jobs_registry, &job_id_task);
                return;
            }
        };
        let resolved_device_uuid: Option<uuid::Uuid> = match device_id {
            Some(s) if !s.is_empty() => match uuid::Uuid::parse_str(&s) {
                Ok(u) => Some(u),
                Err(e) => {
                    emit_error(&app, &job_id_task, phase, e.to_string());
                    deregister_job(&jobs_registry, &job_id_task);
                    return;
                }
            },
            _ => stored.default_device_id,
        };
        let device_bits = resolved_device_uuid.map(device_id_bits_from_uuid).unwrap_or([0, 0]);
        let device_name = resolved_device_uuid
            .as_ref()
            .and_then(|u| device_store.find(u))
            .map(|d| d.name.clone());

        let paths = walk_images(&dir);
        let total = paths.len() as u64;

        emit_progress(&app, &job_id_task, phase, 0, total, None, 0);


        use rayon::prelude::*;
        use std::sync::atomic::AtomicU64;

        let processed = AtomicU64::new(0);
        let failed = AtomicU64::new(0);
        let sidecars = AtomicU64::new(0);
        let tokens = AtomicU64::new(0);
        let epoch_min = zwatermark_core::current_epoch_min();

        paths
            .par_iter()
            .enumerate()
            .for_each(|(idx, path)| {
                if cancel.load(Ordering::SeqCst) {
                    return;
                }
                let path_str = path.to_string_lossy().into_owned();
                let p_now = processed.load(Ordering::Relaxed);
                let f_now = failed.load(Ordering::Relaxed);
                emit_progress(
                    &app,
                    &job_id_task,
                    phase,
                    p_now,
                    total,
                    Some(path_str.clone()),
                    f_now,
                );

                let ok = (|| -> Result<(), String> {
                    let img = image::open(path).map_err(|e| e.to_string())?;
                    let payload = zwatermark_core::payload::RobustPayload {
                        version: zwatermark_core::payload::CURRENT_VERSION,
                        user_id: identity.user_id(),
                        device_id: device_bits,
                        epoch_min,
                        counter: (idx as u16) & 0x0FFF,
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
                    let out = path.with_file_name(format!(
                        "{}.zw.png",
                        path.file_stem().and_then(|s| s.to_str()).unwrap_or("out"),
                    ));
                    mark_out.image.save(&out).map_err(|e| e.to_string())?;


                    if let Some(mut sc) = mark_out.sidecar {
                        if !sc.timestamps.is_empty() {
                            if let Ok(d) = sidecar::image_digest_from_path(&out) {
                                sc.image_digest_sha256 = d;
                            }
                            let count = (sc.timestamps.rfc3161_tokens.len()
                                + sc.timestamps.ots_receipts.len())
                                as u64;
                            if sidecar::write_sidecar(&out, &sc).is_ok() {
                                sidecars.fetch_add(1, Ordering::Relaxed);
                                tokens.fetch_add(count, Ordering::Relaxed);
                            }
                        }
                    }
                    Ok(())
                })();

                if ok.is_ok() {
                    processed.fetch_add(1, Ordering::Relaxed);
                } else {
                    failed.fetch_add(1, Ordering::Relaxed);
                }
                let p = processed.load(Ordering::Relaxed);
                let f = failed.load(Ordering::Relaxed);
                emit_progress(&app, &job_id_task, phase, p, total, None, f);
            });

        let processed = processed.load(Ordering::Relaxed);
        let failed = failed.load(Ordering::Relaxed);
        let sidecars_written = sidecars.load(Ordering::Relaxed) as u32;
        let timestamps_obtained = tokens.load(Ordering::Relaxed) as u32;

        let result = BatchMarkResult {
            processed: processed as u32,
            failed: failed as u32,
            duration_ms: started.elapsed().as_millis() as u32,
            sidecars_written,
            timestamps_obtained,
        };
        let cancelled = cancel.load(Ordering::SeqCst);
        if let Some(state) = app.try_state::<AppState>() {
            state.log(
                if cancelled { ActivityLevel::Warning } else { ActivityLevel::Success },
                ActivitySource::Batch,
                if cancelled {
                    format!("Batch mark cancelled ({} of {} processed)", result.processed, total)
                } else {
                    format!("Batch mark done: {} processed, {} failed", result.processed, result.failed)
                },
                Some(folder_for_log.clone()),
            );
        }
        let _ = app.emit(
            "batch:done",
            BatchDoneMarkPayload {
                job_id: job_id_task.clone(),
                phase,
                result,
            },
        );
        deregister_job(&jobs_registry, &job_id_task);
    });

    Ok(BatchStartResult { job_id })
}

#[tauri::command]
pub async fn batch_cancel(state: State<'_, AppState>, job_id: String) -> Result<(), String> {
    let guard = state.batch_jobs.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = guard.get(&job_id) {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}
