use crate::activity::{ActivityLevel, ActivitySource};
use crate::ipc::dto::IdentitySummary;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use zwatermark_core::identity::Identity;
use zwatermark_core::store::{self, IdentityStore, StoredIdentity};


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdentityExportPayload {
    id: String,
    display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    email: Option<String>,
    seed_hex: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    default_device_id: Option<String>,
}

fn to_dto(s: &StoredIdentity) -> IdentitySummary {
    IdentitySummary {
        id: s.id.to_string(),
        display_name: s.display_name.clone(),
        email: s.email.clone(),
        verifying_key_hex: s.verifying_key_hex.clone(),
        created_epoch_s: s.created_epoch_s,
        default_device_id: s.default_device_id.map(|u| u.to_string()),
    }
}

#[tauri::command]
pub async fn identity_list(_state: State<'_, AppState>) -> Result<Vec<IdentitySummary>, String> {
    let path = store::default_identity_path().map_err(|e| e.to_string())?;
    let store = IdentityStore::load(&path).map_err(|e| e.to_string())?;
    Ok(store.identities.iter().map(to_dto).collect())
}

#[tauri::command]
pub async fn identity_generate(
    state: State<'_, AppState>,
    display_name: String,
    email: Option<String>,
) -> Result<IdentitySummary, String> {
    let name = display_name.trim().to_string();
    if name.is_empty() {
        return Err("display name required".into());
    }

    let identity = Identity::generate(&name, email.as_deref());
    let stored = StoredIdentity::from_identity(&identity).map_err(|e| e.to_string())?;

    let path = store::default_identity_path().map_err(|e| e.to_string())?;
    let mut existing = IdentityStore::load(&path).map_err(|e| e.to_string())?;
    existing.insert(stored.clone());
    existing.save(&path).map_err(|e| e.to_string())?;

    state.refresh_signing_keys();
    state.log(
        ActivityLevel::Info,
        ActivitySource::Identity,
        format!("Created identity \"{}\"", stored.display_name),
        Some(stored.id.to_string()),
    );
    Ok(to_dto(&stored))
}

#[tauri::command]
pub async fn identity_update(
    state: State<'_, AppState>,
    id: String,
    display_name: String,
    email: Option<String>,
    default_device_id: Option<String>,
) -> Result<IdentitySummary, String> {
    let name = display_name.trim().to_string();
    if name.is_empty() {
        return Err("display name required".into());
    }
    let uuid = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let default_dev = match default_device_id {
        Some(s) if !s.is_empty() => Some(uuid::Uuid::parse_str(&s).map_err(|e| e.to_string())?),
        _ => None,
    };
    let path = store::default_identity_path().map_err(|e| e.to_string())?;
    let mut store = IdentityStore::load(&path).map_err(|e| e.to_string())?;
    let stored = store
        .identities
        .iter_mut()
        .find(|i| i.id == uuid)
        .ok_or("identity not found")?;
    stored.display_name = name;
    stored.email = email.and_then(|s| {
        let s = s.trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    });
    stored.default_device_id = default_dev;
    let updated = stored.clone();
    store.save(&path).map_err(|e| e.to_string())?;
    state.log(
        ActivityLevel::Info,
        ActivitySource::Identity,
        format!("Updated identity \"{}\"", updated.display_name),
        Some(updated.id.to_string()),
    );
    Ok(to_dto(&updated))
}

#[tauri::command]
pub async fn identity_export(id: String) -> Result<String, String> {
    let uuid = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let path = store::default_identity_path().map_err(|e| e.to_string())?;
    let store = IdentityStore::load(&path).map_err(|e| e.to_string())?;
    let stored = store.find(&uuid).ok_or("identity not found")?;
    let payload = IdentityExportPayload {
        id: stored.id.to_string(),
        display_name: stored.display_name.clone(),
        email: stored.email.clone(),
        seed_hex: stored.seed_hex.clone(),
        default_device_id: stored.default_device_id.map(|u| u.to_string()),
    };
    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn identity_import(
    state: State<'_, AppState>,
    json: String,
) -> Result<IdentitySummary, String> {
    let payload: IdentityExportPayload =
        serde_json::from_str(&json).map_err(|e| format!("invalid identity file: {}", e))?;

    let uuid = uuid::Uuid::parse_str(&payload.id)
        .map_err(|e| format!("invalid identity id: {}", e))?;


    let seed_bytes =
        hex::decode(&payload.seed_hex).map_err(|e| format!("invalid seed hex: {}", e))?;
    if seed_bytes.len() != 32 {
        return Err("invalid seed length (expected 32 bytes)".into());
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&seed_bytes);


    let sk = ed25519_dalek::SigningKey::from_bytes(&seed);
    let vk = sk.verifying_key().to_bytes();

    let default_dev = match payload.default_device_id.as_deref() {
        Some(s) if !s.is_empty() => Some(
            uuid::Uuid::parse_str(s).map_err(|e| format!("invalid default device id: {}", e))?,
        ),
        _ => None,
    };

    let path = store::default_identity_path().map_err(|e| e.to_string())?;
    let mut existing = IdentityStore::load(&path).map_err(|e| e.to_string())?;
    if existing.find(&uuid).is_some() {
        return Err(format!("identity with id {} already exists", uuid));
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let stored = StoredIdentity {
        id: uuid,
        display_name: payload.display_name.clone(),
        email: payload.email.clone(),
        verifying_key_hex: hex::encode(vk),
        seed_hex: payload.seed_hex.clone(),
        created_epoch_s: now,
        default_device_id: default_dev,
    };
    existing.insert(stored.clone());
    existing.save(&path).map_err(|e| e.to_string())?;

    state.refresh_signing_keys();
    state.log(
        ActivityLevel::Info,
        ActivitySource::Identity,
        format!("Imported identity \"{}\"", stored.display_name),
        Some(stored.id.to_string()),
    );
    Ok(to_dto(&stored))
}

#[tauri::command]
pub async fn identity_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let uuid = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let path = store::default_identity_path().map_err(|e| e.to_string())?;
    let mut store = IdentityStore::load(&path).map_err(|e| e.to_string())?;
    let display_name = store
        .find(&uuid)
        .map(|s| s.display_name.clone())
        .unwrap_or_else(|| uuid.to_string());
    if !store.remove(&uuid) {
        return Err("identity not found".into());
    }
    store.save(&path).map_err(|e| e.to_string())?;
    state.refresh_signing_keys();
    state.log(
        ActivityLevel::Info,
        ActivitySource::Identity,
        format!("Deleted identity \"{display_name}\""),
        Some(uuid.to_string()),
    );
    Ok(())
}
