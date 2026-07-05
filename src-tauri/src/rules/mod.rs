use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleSet {
    #[serde(default)]
    pub folder_allow: Vec<String>,
    #[serde(default)]
    pub folder_deny: Vec<String>,
    #[serde(default)]
    pub work_hours_only: bool,
    #[serde(default)]
    pub work_hours_start: Option<String>,
    #[serde(default)]
    pub work_hours_end: Option<String>,

    #[serde(default)]
    pub folder_strength: BTreeMap<String, String>,
}
