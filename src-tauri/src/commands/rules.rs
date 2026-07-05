use crate::activity::{ActivityLevel, ActivitySource};
use crate::rules::RuleSet;
use crate::state::AppState;
use tauri::State;
use zwatermark_core::store;

#[tauri::command]
pub async fn rules_get() -> Result<RuleSet, String> {
    let path = store::default_rules_path().map_err(|e| e.to_string())?;
    let loaded: Option<RuleSet> = store::read_json(&path).map_err(|e| e.to_string())?;
    Ok(loaded.unwrap_or_default())
}

#[tauri::command]
pub async fn rules_set(state: State<'_, AppState>, rules: RuleSet) -> Result<(), String> {
    let path = store::default_rules_path().map_err(|e| e.to_string())?;
    store::write_json(&path, &rules).map_err(|e| e.to_string())?;
    state.log(
        ActivityLevel::Info,
        ActivitySource::Rules,
        "Marking rules updated",
        None,
    );
    Ok(())
}
