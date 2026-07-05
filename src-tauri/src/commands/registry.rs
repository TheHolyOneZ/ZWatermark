

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use zwatermark_core::identity::{KeyRing, PublicIdentity};
use zwatermark_core::sign;
use zwatermark_core::store::{self, IdentityStore, StoredIdentity};

const DEFAULT_ENDPOINT: &str = "https://zsync.eu/watermark/pubkeys";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishRequest {
    pub identity_id: String,
    pub display_name: String,
    pub email: Option<String>,
    pub verifying_key_hex: String,
    pub timestamp_s: u64,
    pub signature_hex: String,
}

fn publish_signable(req: &PublishRequest) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(b"zw.publish.v1|");
    out.extend_from_slice(req.identity_id.as_bytes());
    out.push(b'|');
    out.extend_from_slice(req.verifying_key_hex.as_bytes());
    out.push(b'|');
    out.extend_from_slice(req.timestamp_s.to_string().as_bytes());
    out
}

#[tauri::command]
pub async fn registry_publish(
    state: State<'_, AppState>,
    identity_id: String,
    endpoint: Option<String>,
) -> Result<String, String> {
    let sk = state
        .signing_keys
        .lock()
        .map_err(|e| e.to_string())?
        .get(&identity_id)
        .cloned()
        .ok_or("identity not found")?;

    let uuid = uuid::Uuid::parse_str(&identity_id).map_err(|e| e.to_string())?;
    let store_path = store::default_identity_path().map_err(|e| e.to_string())?;
    let store = IdentityStore::load(&store_path).map_err(|e| e.to_string())?;
    let stored: StoredIdentity = store.find(&uuid).cloned().ok_or("identity not found")?;

    let now_s = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut req = PublishRequest {
        identity_id: uuid.to_string(),
        display_name: stored.display_name.clone(),
        email: stored.email.clone(),
        verifying_key_hex: stored.verifying_key_hex.clone(),
        timestamp_s: now_s,
        signature_hex: String::new(),
    };
    let sig = sign::sign(&sk, &publish_signable(&req));
    req.signature_hex = hex::encode(sig.to_bytes());

    let url = endpoint.unwrap_or_else(|| DEFAULT_ENDPOINT.to_string());
    let response = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let body = serde_json::to_vec(&req).map_err(|e| e.to_string())?;
        let agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(10))
            .build();
        let resp = agent
            .post(&url)
            .set("Content-Type", "application/json")
            .send_bytes(&body)
            .map_err(|e| e.to_string())?;
        let mut out = String::new();
        std::io::Read::read_to_string(&mut resp.into_reader(), &mut out)
            .map_err(|e| e.to_string())?;
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(response)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryLookup {
    pub id: String,
    pub display_name: String,
    pub email: Option<String>,
    pub verifying_key_hex: String,
}

#[tauri::command]
pub async fn registry_import(
    user_id_hex: String,
    endpoint: Option<String>,
) -> Result<PublicIdentity, String> {
    let url = endpoint.unwrap_or_else(|| DEFAULT_ENDPOINT.to_string());
    let user_id_hex_c = user_id_hex.clone();
    let lookup = tokio::task::spawn_blocking(move || -> Result<RegistryLookup, String> {
        let agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(10))
            .build();
        let resp = agent
            .get(&format!("{}/{}", url, user_id_hex_c))
            .call()
            .map_err(|e| e.to_string())?;
        let text = resp.into_string().map_err(|e| e.to_string())?;
        serde_json::from_str::<RegistryLookup>(&text).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    let uuid = uuid::Uuid::parse_str(&lookup.id).map_err(|e| e.to_string())?;
    let vk_bytes = hex::decode(&lookup.verifying_key_hex).map_err(|e| e.to_string())?;
    if vk_bytes.len() != 32 { return Err("invalid pubkey length".into()); }
    let mut vk = [0u8; 32];
    vk.copy_from_slice(&vk_bytes);

    let pub_id = PublicIdentity {
        id: uuid,
        display_name: lookup.display_name,
        email: lookup.email,
        verifying_key: vk,
    };

    let ring_path = store::default_keyring_path().map_err(|e| e.to_string())?;
    let mut ring: KeyRing = if ring_path.exists() {
        let bytes = std::fs::read(&ring_path).map_err(|e| e.to_string())?;
        serde_json::from_slice(&bytes).unwrap_or_default()
    } else {
        KeyRing::new()
    };
    ring.insert(pub_id.clone());

    if let Some(parent) = ring_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(&ring).map_err(|e| e.to_string())?;
    std::fs::write(&ring_path, bytes).map_err(|e| e.to_string())?;

    Ok(pub_id)
}
