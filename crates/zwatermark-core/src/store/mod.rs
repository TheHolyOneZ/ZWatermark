

use crate::device::Device;
use crate::envelope;
use crate::identity::{Identity, PublicIdentity};
use ed25519_dalek::SigningKey;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const APP_DIR: &str = "zwatermark";
pub const IDENTITIES_FILE: &str = "identities.json";
pub const KEYRING_FILE: &str = "keyring.json";
pub const SETTINGS_FILE: &str = "settings.json";
pub const RULES_FILE: &str = "rules.json";
pub const DEVICES_FILE: &str = "devices.json";

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("envelope: {0}")]
    Envelope(#[from] envelope::EnvelopeError),
    #[error("hex: {0}")]
    Hex(#[from] hex::FromHexError),
    #[error("no identity with id {0}")]
    NotFound(uuid::Uuid),
    #[error("identity has no in-memory signing key")]
    NoSigningKey,
    #[error("no config directory on this platform")]
    NoConfigDir,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredIdentity {
    pub id: uuid::Uuid,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    pub verifying_key_hex: String,
    pub seed_hex: String,
    pub created_epoch_s: u64,


    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_device_id: Option<uuid::Uuid>,
}

impl StoredIdentity {
    pub fn from_identity(id: &Identity) -> Result<Self, StoreError> {
        let sk = id.signing_key.as_ref().ok_or(StoreError::NoSigningKey)?;
        Ok(Self {
            id: id.id,
            display_name: id.display_name.clone(),
            email: id.email.clone(),
            verifying_key_hex: hex::encode(id.verifying_key),
            seed_hex: hex::encode(sk.to_bytes()),
            created_epoch_s: id.created_epoch_s,
            default_device_id: None,
        })
    }


    pub fn to_public(&self) -> Result<PublicIdentity, StoreError> {
        let vk_bytes = hex::decode(&self.verifying_key_hex)?;
        if vk_bytes.len() != 32 {
            return Err(StoreError::Hex(hex::FromHexError::InvalidStringLength));
        }
        let mut vk = [0u8; 32];
        vk.copy_from_slice(&vk_bytes);
        Ok(PublicIdentity {
            id: self.id,
            display_name: self.display_name.clone(),
            email: self.email.clone(),
            verifying_key: vk,
        })
    }


    pub fn to_identity(&self) -> Result<Identity, StoreError> {
        let seed_bytes = hex::decode(&self.seed_hex)?;
        if seed_bytes.len() != 32 {
            return Err(StoreError::Hex(hex::FromHexError::InvalidStringLength));
        }
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&seed_bytes);
        let sk = SigningKey::from_bytes(&seed);
        let vk = sk.verifying_key().to_bytes();
        Ok(Identity {
            id: self.id,
            display_name: self.display_name.clone(),
            email: self.email.clone(),
            signing_key: Some(sk),
            verifying_key: vk,
            created_epoch_s: self.created_epoch_s,
        })
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct IdentityStore {
    #[serde(default)]
    pub identities: Vec<StoredIdentity>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct DeviceStore {
    #[serde(default)]
    pub devices: Vec<Device>,
}

impl DeviceStore {
    pub fn load(path: &Path) -> Result<Self, StoreError> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let bytes = std::fs::read(path)?;
        if bytes.is_empty() {
            return Ok(Self::default());
        }
        Ok(serde_json::from_slice(&bytes)?)
    }

    pub fn save(&self, path: &Path) -> Result<(), StoreError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_vec_pretty(self)?;
        atomic_write(path, &json)?;
        Ok(())
    }

    pub fn find(&self, id: &uuid::Uuid) -> Option<&Device> {
        self.devices.iter().find(|d| &d.id == id)
    }


    pub fn find_by_id_bits(&self, bits: [u8; 2]) -> Option<&Device> {
        self.devices.iter().find(|d| d.device_id_bits() == bits)
    }

    pub fn insert(&mut self, device: Device) {
        if let Some(existing) = self.devices.iter_mut().find(|d| d.id == device.id) {
            *existing = device;
        } else {
            self.devices.push(device);
        }
    }

    pub fn remove(&mut self, id: &uuid::Uuid) -> bool {
        let before = self.devices.len();
        self.devices.retain(|d| &d.id != id);
        self.devices.len() != before
    }
}

impl IdentityStore {
    pub fn load(path: &Path) -> Result<Self, StoreError> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let bytes = std::fs::read(path)?;
        if bytes.is_empty() {
            return Ok(Self::default());
        }
        Ok(serde_json::from_slice(&bytes)?)
    }

    pub fn save(&self, path: &Path) -> Result<(), StoreError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_vec_pretty(self)?;
        atomic_write(path, &json)?;
        Ok(())
    }

    pub fn find(&self, id: &uuid::Uuid) -> Option<&StoredIdentity> {
        self.identities.iter().find(|i| &i.id == id)
    }


    pub fn find_by_prefix(&self, prefix: &str) -> Option<&StoredIdentity> {
        let p = prefix.to_ascii_lowercase();
        self.identities
            .iter()
            .find(|i| i.id.to_string().starts_with(&p))
    }

    pub fn insert(&mut self, stored: StoredIdentity) {
        if let Some(existing) = self.identities.iter_mut().find(|i| i.id == stored.id) {
            *existing = stored;
        } else {
            self.identities.push(stored);
        }
    }

    pub fn remove(&mut self, id: &uuid::Uuid) -> bool {
        let before = self.identities.len();
        self.identities.retain(|i| &i.id != id);
        self.identities.len() != before
    }
}


pub fn default_identity_path() -> Result<PathBuf, StoreError> {
    Ok(config_dir()?.join(IDENTITIES_FILE))
}


pub fn default_devices_path() -> Result<PathBuf, StoreError> {
    Ok(config_dir()?.join(DEVICES_FILE))
}


pub fn default_keyring_path() -> Result<PathBuf, StoreError> {
    Ok(config_dir()?.join(KEYRING_FILE))
}


pub fn default_settings_path() -> Result<PathBuf, StoreError> {
    Ok(config_dir()?.join(SETTINGS_FILE))
}


pub fn default_rules_path() -> Result<PathBuf, StoreError> {
    Ok(config_dir()?.join(RULES_FILE))
}


pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<Option<T>, StoreError> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path)?;
    if bytes.is_empty() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&bytes)?))
}


pub fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), StoreError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(value)?;
    atomic_write(path, &bytes)?;
    Ok(())
}

fn config_dir() -> Result<PathBuf, StoreError> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
            return Ok(PathBuf::from(xdg).join(APP_DIR));
        }
        let home = std::env::var("HOME").map_err(|_| StoreError::NoConfigDir)?;
        Ok(PathBuf::from(home).join(".config").join(APP_DIR))
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|_| StoreError::NoConfigDir)?;
        Ok(PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join(APP_DIR))
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").map_err(|_| StoreError::NoConfigDir)?;
        Ok(PathBuf::from(appdata).join(APP_DIR))
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Err(StoreError::NoConfigDir)
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let tmp = parent.join(format!(
        ".{}.tmp",
        path.file_name().and_then(|s| s.to_str()).unwrap_or("out")
    ));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stored_identity_roundtrip() {
        let id = Identity::generate("Alice", Some("a@example.com"));
        let stored = StoredIdentity::from_identity(&id).unwrap();
        assert_eq!(stored.display_name, "Alice");
        assert_eq!(stored.verifying_key_hex.len(), 64);
        assert_eq!(stored.seed_hex.len(), 64);

        let back = stored.to_identity().unwrap();
        assert_eq!(back.verifying_key, id.verifying_key);
        assert!(back.signing_key.is_some());
    }

    #[test]
    fn store_persists_across_load() {
        let tmp = std::env::temp_dir().join(format!("zw-store-{}.json", uuid::Uuid::new_v4()));
        let id = Identity::generate("Carol", None);
        let stored = StoredIdentity::from_identity(&id).unwrap();
        let mut store = IdentityStore::default();
        store.insert(stored);
        store.save(&tmp).unwrap();

        let back = IdentityStore::load(&tmp).unwrap();
        assert_eq!(back.identities.len(), 1);
        assert_eq!(back.identities[0].display_name, "Carol");
        std::fs::remove_file(&tmp).ok();
    }
}
