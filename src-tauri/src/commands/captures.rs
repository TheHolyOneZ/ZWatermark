use crate::ipc::dto::CaptureLogEntry;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn captures_recent(
    state: State<'_, AppState>,
    limit: u32,
) -> Result<Vec<CaptureLogEntry>, String> {
    Ok(state.recent_captures(limit as usize))
}
