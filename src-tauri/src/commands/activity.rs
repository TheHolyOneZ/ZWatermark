use crate::activity::ActivityEvent;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn activity_recent(
    state: State<'_, AppState>,
    limit: u32,
) -> Result<Vec<ActivityEvent>, String> {
    Ok(state.recent_activity(limit as usize))
}
