

use crate::envelope::{open_seed, seal_seed, EnvelopeError};
use crate::store::{read_json, write_json, StoreError, APP_DIR};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const VAULT_FILE: &str = "vault.json";


const MARKER: [u8; 32] = *b"ZWATERMARK_VAULT_MARKER_v1______";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultFile {

    pub sealed_marker_hex: String,
}

#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    #[error("vault store: {0}")]
    Store(#[from] StoreError),
    #[error("hex: {0}")]
    Hex(#[from] hex::FromHexError),
    #[error("envelope: {0}")]
    Envelope(#[from] EnvelopeError),
    #[error("wrong password")]
    WrongPassword,
}

pub fn default_vault_path() -> Result<PathBuf, StoreError> {
    Ok(config_dir()?.join(VAULT_FILE))
}

pub fn is_enabled(path: &Path) -> bool {
    path.exists()
}

pub fn enable(path: &Path, password: &str) -> Result<(), VaultError> {
    let sealed = seal_seed(&MARKER, password)?;
    let file = VaultFile { sealed_marker_hex: hex::encode(&sealed) };
    write_json(path, &file)?;
    Ok(())
}

pub fn verify(path: &Path, password: &str) -> Result<(), VaultError> {
    let file: VaultFile = read_json(path)?.ok_or(VaultError::WrongPassword)?;
    let sealed = hex::decode(&file.sealed_marker_hex)?;
    let opened = open_seed(&sealed, password).map_err(|_| VaultError::WrongPassword)?;
    if opened != MARKER {
        return Err(VaultError::WrongPassword);
    }
    Ok(())
}

pub fn disable(path: &Path, password: &str) -> Result<(), VaultError> {
    verify(path, password)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| VaultError::Store(StoreError::Io(e)))?;
    }
    Ok(())
}

pub fn change_password(path: &Path, old: &str, new: &str) -> Result<(), VaultError> {
    verify(path, old)?;
    enable(path, new)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enable_and_verify_roundtrip() {
        let tmp = std::env::temp_dir().join(format!("zw-vault-{}.json", uuid::Uuid::new_v4()));
        enable(&tmp, "hunter2hunter2").unwrap();
        assert!(is_enabled(&tmp));
        verify(&tmp, "hunter2hunter2").unwrap();
        assert!(matches!(verify(&tmp, "wrong"), Err(VaultError::WrongPassword)));
        std::fs::remove_file(&tmp).ok();
    }

    #[test]
    fn change_password_works() {
        let tmp = std::env::temp_dir().join(format!("zw-vault-{}.json", uuid::Uuid::new_v4()));
        enable(&tmp, "old-one-passphrase").unwrap();
        change_password(&tmp, "old-one-passphrase", "new-one-passphrase").unwrap();
        assert!(matches!(verify(&tmp, "old-one-passphrase"), Err(VaultError::WrongPassword)));
        verify(&tmp, "new-one-passphrase").unwrap();
        std::fs::remove_file(&tmp).ok();
    }
}
