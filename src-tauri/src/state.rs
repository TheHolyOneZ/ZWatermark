use ed25519_dalek::SigningKey;
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};

use tauri::{AppHandle, Emitter};

use crate::activity::{ActivityEvent, ActivityLevel, ActivitySource, ACTIVITY_CAP};
use crate::ipc::dto::CaptureLogEntry;
use crate::settings::Settings;
use zwatermark_core::store::{self, IdentityStore};
use zwatermark_core::vault;


const CAPTURES_CAP: usize = 200;

pub struct AppState {
    pub settings: Arc<RwLock<Settings>>,


    pub signing_keys: Arc<Mutex<HashMap<String, SigningKey>>>,

    pub captures: Arc<Mutex<VecDeque<CaptureLogEntry>>>,


    pub activity: Arc<Mutex<VecDeque<ActivityEvent>>>,


    pub app_handle: OnceLock<AppHandle>,


    pub legacy_migrated: AtomicBool,


    pub vault_unlocked: AtomicBool,


    pub batch_jobs: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,


    pub capture_watcher: Arc<Mutex<Option<Box<dyn std::any::Any + Send>>>>,
}

impl AppState {
    pub fn new() -> Self {
        let migrated = migrate_legacy_identities();
        let settings = load_persisted_settings().unwrap_or_default();
        let vault_enabled = vault::default_vault_path()
            .map(|p| vault::is_enabled(&p))
            .unwrap_or(false);
        let signing_keys = if vault_enabled {
            HashMap::new()
        } else {
            load_signing_keys()
        };
        Self {
            settings: Arc::new(RwLock::new(settings)),
            signing_keys: Arc::new(Mutex::new(signing_keys)),
            captures: Arc::new(Mutex::new(VecDeque::with_capacity(CAPTURES_CAP))),
            activity: Arc::new(Mutex::new(VecDeque::with_capacity(ACTIVITY_CAP))),
            app_handle: OnceLock::new(),
            legacy_migrated: AtomicBool::new(migrated),
            vault_unlocked: AtomicBool::new(!vault_enabled),
            batch_jobs: Arc::new(Mutex::new(HashMap::new())),
            capture_watcher: Arc::new(Mutex::new(None)),
        }
    }


    pub fn log(
        &self,
        level: ActivityLevel,
        source: ActivitySource,
        message: impl Into<String>,
        details: Option<String>,
    ) {
        let event = ActivityEvent::new(level, source, message, details);
        if let Ok(mut guard) = self.activity.lock() {
            if guard.len() == ACTIVITY_CAP {
                guard.pop_back();
            }
            guard.push_front(event.clone());
        } else {
            tracing::warn!("activity mutex poisoned — dropping event");
        }
        if let Some(handle) = self.app_handle.get() {
            let _ = handle.emit("activity:event", &event);
        }
    }

    pub fn recent_activity(&self, limit: usize) -> Vec<ActivityEvent> {
        let Ok(guard) = self.activity.lock() else { return Vec::new() };
        guard.iter().take(limit).cloned().collect()
    }

    pub fn is_vault_unlocked(&self) -> bool {
        self.vault_unlocked.load(Ordering::SeqCst)
    }

    pub fn set_vault_unlocked(&self, v: bool) {
        self.vault_unlocked.store(v, Ordering::SeqCst);
    }


    pub fn take_legacy_migrated(&self) -> bool {
        self.legacy_migrated.swap(false, Ordering::SeqCst)
    }


    pub fn refresh_signing_keys(&self) {
        let fresh = load_signing_keys();
        if let Ok(mut guard) = self.signing_keys.lock() {
            *guard = fresh;
        }
    }

    pub fn push_capture(&self, entry: CaptureLogEntry) {
        let Ok(mut guard) = self.captures.lock() else { return };
        if guard.len() == CAPTURES_CAP {
            guard.pop_back();
        }
        guard.push_front(entry);
    }

    pub fn recent_captures(&self, limit: usize) -> Vec<CaptureLogEntry> {
        let Ok(guard) = self.captures.lock() else { return Vec::new() };
        guard.iter().take(limit).cloned().collect()
    }
}

fn load_persisted_settings() -> Option<Settings> {
    let path = store::default_settings_path().ok()?;
    let mut value = store::read_json::<serde_json::Value>(&path).ok().flatten()?;
    if let Some(obj) = value.as_object_mut() {
        if !obj.contains_key("captureWatchedFolders") {
            let migrated = obj
                .remove("captureDirOverride")
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .filter(|s| !s.is_empty())
                .map(|s| vec![s])
                .unwrap_or_default();
            obj.insert(
                "captureWatchedFolders".into(),
                serde_json::Value::Array(
                    migrated.into_iter().map(serde_json::Value::String).collect(),
                ),
            );
        } else {
            obj.remove("captureDirOverride");
        }
    }
    serde_json::from_value(value).ok()
}


fn migrate_legacy_identities() -> bool {
    let Ok(path) = store::default_identity_path() else { return false };
    let Ok(bytes) = std::fs::read(&path) else { return false };
    if !memchr_contains(&bytes, b"sealed_seed_hex") {
        return false;
    }
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let backup = path.with_extension(format!("json.legacy-{stamp}.bak"));
    match std::fs::rename(&path, &backup) {
        Ok(()) => {
            tracing::warn!(from = %path.display(), to = %backup.display(), "moved legacy identity store aside");
            true
        }
        Err(e) => {
            tracing::error!(error = %e, "failed to move legacy identity store");
            false
        }
    }
}

fn memchr_contains(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() || needle.len() > haystack.len() {
        return false;
    }
    haystack.windows(needle.len()).any(|w| w == needle)
}

fn load_signing_keys() -> HashMap<String, SigningKey> {
    let Ok(path) = store::default_identity_path() else {
        return HashMap::new();
    };
    let Ok(store) = IdentityStore::load(&path) else {
        return HashMap::new();
    };
    let mut out = HashMap::with_capacity(store.identities.len());
    for stored in &store.identities {
        match stored.to_identity() {
            Ok(id) => {
                if let Some(sk) = id.signing_key {
                    out.insert(stored.id.to_string(), sk);
                }
            }
            Err(e) => tracing::warn!(id = %stored.id, error = %e, "identity failed to load — skipping"),
        }
    }
    out
}
