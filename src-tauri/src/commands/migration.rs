use crate::state::AppState;
use tauri::State;


#[tauri::command]
pub async fn migration_take_legacy_flag(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.take_legacy_migrated())
}
