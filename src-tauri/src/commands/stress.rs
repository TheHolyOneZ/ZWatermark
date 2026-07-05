

use crate::activity::{ActivityLevel, ActivitySource};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use zwatermark_core::attack::{apply_attack, Attack};
use zwatermark_core::identity::KeyRing;
use zwatermark_core::store::{self, IdentityStore};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StressRow {
    pub path: String,
    pub attack_label: String,
    pub baseline_signature_ok: bool,
    pub baseline_confidence: f32,
    pub attacked_robust_found: bool,
    pub attacked_fragile_found: bool,
    pub attacked_signature_ok: bool,


    pub attacked_identity_known: bool,


    pub attacked_identity_verified: bool,
    pub attacked_confidence: f32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StressReport {
    pub rows: Vec<StressRow>,
    pub duration_ms: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StressStartResult {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    job_id: String,
    processed: u64,
    total: u64,
    current: Option<String>,
    failed: u64,
    latest: Option<StressRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DonePayload {
    job_id: String,
    report: StressReport,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    job_id: String,
    error: String,
}

#[tauri::command]
pub async fn stress_start(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
    attacks: Vec<Attack>,
    chain: bool,
) -> Result<StressStartResult, String> {
    if paths.is_empty() {
        return Err("no images supplied".into());
    }
    if attacks.is_empty() {
        return Err("no attacks configured".into());
    }

    let job_id = uuid::Uuid::new_v4().to_string();
    let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    {
        let mut guard = state.batch_jobs.lock().map_err(|e| e.to_string())?;
        guard.insert(job_id.clone(), cancel.clone());
    }
    let job_id_task = job_id.clone();
    let jobs_registry = state.batch_jobs.clone();

    state.log(
        ActivityLevel::Info,
        ActivitySource::Batch,
        format!("Stress test started: {} image(s) × {} attack(s)", paths.len(), attacks.len()),
        Some(format!("jobId={job_id}")),
    );

    tokio::task::spawn_blocking(move || {
        let started = std::time::Instant::now();
        let total = if chain {
            paths.len() as u64
        } else {
            (paths.len() * attacks.len()) as u64
        };
        let mut processed: u64 = 0;
        let mut failed: u64 = 0;
        let mut rows: Vec<StressRow> = Vec::with_capacity(total as usize);

        let store_path = match store::default_identity_path() {
            Ok(p) => p,
            Err(e) => {
                emit_error(&app, &job_id_task, e.to_string());
                deregister(&jobs_registry, &job_id_task);
                return;
            }
        };
        let id_store = match IdentityStore::load(&store_path) {
            Ok(s) => s,
            Err(e) => {
                emit_error(&app, &job_id_task, e.to_string());
                deregister(&jobs_registry, &job_id_task);
                return;
            }
        };
        let mut ring = KeyRing::new();
        for s in &id_store.identities {
            if let Ok(pub_id) = s.to_public() {
                ring.insert(pub_id);
            }
        }

        emit_progress(&app, &job_id_task, processed, total, None, failed, None);

        'outer: for path in &paths {
            if cancel.load(Ordering::SeqCst) {
                break 'outer;
            }
            let original = match image::open(path) {
                Ok(i) => i,
                Err(e) => {
                    let label_err = if chain {
                        chain_label(&attacks)
                    } else {
                        "load".into()
                    };
                    let rows_to_emit = if chain { 1 } else { attacks.len() };
                    for _ in 0..rows_to_emit {
                        let row = StressRow {
                            path: path.clone(),
                            attack_label: label_err.clone(),
                            baseline_signature_ok: false,
                            baseline_confidence: 0.0,
                            attacked_robust_found: false,
                            attacked_fragile_found: false,
                            attacked_signature_ok: false,
                            attacked_identity_known: false,
                            attacked_identity_verified: false,
                            attacked_confidence: 0.0,
                            error: Some(e.to_string()),
                        };
                        rows.push(row.clone());
                        processed += 1;
                        failed += 1;
                        emit_progress(&app, &job_id_task, processed, total, Some(path.clone()), failed, Some(row));
                    }
                    continue;
                }
            };

            let baseline = zwatermark_core::verify(&original, &ring).ok();
            let baseline_signature_ok = baseline.as_ref().map(|r| r.signature_ok).unwrap_or(false);
            let baseline_confidence = baseline.as_ref().map(|r| r.confidence).unwrap_or(0.0);

            if chain {
                if cancel.load(Ordering::SeqCst) {
                    break 'outer;
                }


                let mut mangled = original.clone();
                for attack in &attacks {
                    mangled = apply_attack(&mangled, attack);
                }
                let row = match zwatermark_core::verify(&mangled, &ring) {
                    Ok(v) => StressRow {
                        path: path.clone(),
                        attack_label: chain_label(&attacks),
                        baseline_signature_ok,
                        baseline_confidence,
                        attacked_robust_found: v.robust.is_some(),
                        attacked_fragile_found: v.fragile.is_some(),
                        attacked_signature_ok: v.signature_ok,
                        attacked_identity_known: v.originator.is_some(),
                        attacked_identity_verified: v.identity_verified,
                        attacked_confidence: v.confidence,
                        error: None,
                    },
                    Err(e) => {
                        failed += 1;
                        StressRow {
                            path: path.clone(),
                            attack_label: chain_label(&attacks),
                            baseline_signature_ok,
                            baseline_confidence,
                            attacked_robust_found: false,
                            attacked_fragile_found: false,
                            attacked_signature_ok: false,
                            attacked_identity_known: false,
                            attacked_identity_verified: false,
                            attacked_confidence: 0.0,
                            error: Some(e.to_string()),
                        }
                    }
                };
                rows.push(row.clone());
                processed += 1;
                emit_progress(&app, &job_id_task, processed, total, Some(path.clone()), failed, Some(row));
            } else {
                for attack in &attacks {
                    if cancel.load(Ordering::SeqCst) {
                        break 'outer;
                    }


                    let row = (|| -> StressRow {
                        let mangled = apply_attack(&original, attack);
                        match zwatermark_core::verify(&mangled, &ring) {
                            Ok(v) => StressRow {
                                path: path.clone(),
                                attack_label: attack.label(),
                                baseline_signature_ok,
                                baseline_confidence,
                                attacked_robust_found: v.robust.is_some(),
                                attacked_fragile_found: v.fragile.is_some(),
                                attacked_signature_ok: v.signature_ok,
                                attacked_identity_known: v.originator.is_some(),
                                attacked_identity_verified: v.identity_verified,
                                attacked_confidence: v.confidence,
                                error: None,
                            },
                            Err(e) => StressRow {
                                path: path.clone(),
                                attack_label: attack.label(),
                                baseline_signature_ok,
                                baseline_confidence,
                                attacked_robust_found: false,
                                attacked_fragile_found: false,
                                attacked_signature_ok: false,
                                attacked_identity_known: false,
                                attacked_identity_verified: false,
                                attacked_confidence: 0.0,
                                error: Some(e.to_string()),
                            },
                        }
                    })();
                    if row.error.is_some() {
                        failed += 1;
                    }
                    rows.push(row.clone());
                    processed += 1;
                    emit_progress(
                        &app,
                        &job_id_task,
                        processed,
                        total,
                        Some(path.clone()),
                        failed,
                        Some(row),
                    );
                }
            }
        }

        let report = StressReport {
            rows,
            duration_ms: started.elapsed().as_millis() as u32,
        };
        let _ = app.emit(
            "stress:done",
            DonePayload {
                job_id: job_id_task.clone(),
                report,
            },
        );
        deregister(&jobs_registry, &job_id_task);
    });

    Ok(StressStartResult { job_id })
}

fn emit_progress(
    app: &AppHandle,
    job_id: &str,
    processed: u64,
    total: u64,
    current: Option<String>,
    failed: u64,
    latest: Option<StressRow>,
) {
    let _ = app.emit(
        "stress:progress",
        ProgressPayload {
            job_id: job_id.to_string(),
            processed,
            total,
            current,
            failed,
            latest,
        },
    );
}

fn emit_error(app: &AppHandle, job_id: &str, error: String) {
    let _ = app.emit(
        "stress:error",
        ErrorPayload {
            job_id: job_id.to_string(),
            error,
        },
    );
}

fn chain_label(attacks: &[Attack]) -> String {
    let parts: Vec<String> = attacks.iter().map(|a| a.label()).collect();
    format!("Chain: {}", parts.join(" → "))
}

fn deregister(
    registry: &std::sync::Arc<
        std::sync::Mutex<
            std::collections::HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>,
        >,
    >,
    job_id: &str,
) {
    if let Ok(mut g) = registry.lock() {
        g.remove(job_id);
    }
}
