use crate::activity::{ActivityLevel, ActivitySource};
use crate::ipc::dto::VaultStatus;
use crate::state::AppState;
use tauri::State;
use zwatermark_core::vault;

fn vault_path() -> Result<std::path::PathBuf, String> {
    vault::default_vault_path().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_status(state: State<'_, AppState>) -> Result<VaultStatus, String> {
    let path = vault_path()?;
    Ok(VaultStatus {
        enabled: vault::is_enabled(&path),
        unlocked: state.is_vault_unlocked(),
    })
}

#[tauri::command]
pub async fn vault_enable(state: State<'_, AppState>, password: String) -> Result<(), String> {
    let path = vault_path()?;
    if vault::is_enabled(&path) {
        return Err("vault already enabled".into());
    }
    if password.len() < 8 {
        return Err("password must be at least 8 characters".into());
    }
    vault::enable(&path, &password).map_err(|e| e.to_string())?;


    state.set_vault_unlocked(true);
    state.log(
        ActivityLevel::Info,
        ActivitySource::Vault,
        "Vault enabled",
        None,
    );
    Ok(())
}

#[tauri::command]
pub async fn vault_disable(state: State<'_, AppState>, password: String) -> Result<(), String> {
    let path = vault_path()?;
    if !vault::is_enabled(&path) {
        return Err("vault not enabled".into());
    }
    vault::disable(&path, &password).map_err(|e| e.to_string())?;
    state.set_vault_unlocked(true);
    state.log(
        ActivityLevel::Info,
        ActivitySource::Vault,
        "Vault disabled",
        None,
    );
    Ok(())
}

#[tauri::command]
pub async fn vault_unlock(state: State<'_, AppState>, password: String) -> Result<(), String> {
    let path = vault_path()?;
    if !vault::is_enabled(&path) {
        state.set_vault_unlocked(true);
        return Ok(());
    }
    vault::verify(&path, &password).map_err(|e| e.to_string())?;
    state.set_vault_unlocked(true);
    state.refresh_signing_keys();
    state.log(
        ActivityLevel::Info,
        ActivitySource::Vault,
        "Vault unlocked",
        None,
    );
    Ok(())
}

#[tauri::command]
pub async fn vault_change_password(
    state: State<'_, AppState>,
    old_password: String,
    new_password: String,
) -> Result<(), String> {
    let path = vault_path()?;
    if !vault::is_enabled(&path) {
        return Err("vault not enabled".into());
    }
    if new_password.len() < 8 {
        return Err("new password must be at least 8 characters".into());
    }
    vault::change_password(&path, &old_password, &new_password).map_err(|e| e.to_string())?;
    state.log(
        ActivityLevel::Info,
        ActivitySource::Vault,
        "Vault password changed",
        None,
    );
    Ok(())
}
