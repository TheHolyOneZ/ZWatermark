use crate::activity::{ActivityLevel, ActivitySource};
use crate::settings::Settings;
use crate::state::AppState;
use tauri::{AppHandle, State};
use zwatermark_core::store;

#[tauri::command]
pub async fn settings_get(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(state.settings.read().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub async fn settings_set(
    app: AppHandle,
    state: State<'_, AppState>,
    next: Settings,
) -> Result<(), String> {
    let path = store::default_settings_path().map_err(|e| e.to_string())?;
    store::write_json(&path, &next).map_err(|e| e.to_string())?;

    let prev_folders = state
        .settings
        .read()
        .map(|s| s.capture_watched_folders.clone())
        .unwrap_or_default();
    let next_folders = next.capture_watched_folders.clone();

    *state.settings.write().map_err(|e| e.to_string())? = next;

    state.log(
        ActivityLevel::Info,
        ActivitySource::System,
        "Settings updated",
        None,
    );


    if prev_folders != next_folders {
        crate::rebuild_capture_watcher(&app);
    }

    Ok(())
}
