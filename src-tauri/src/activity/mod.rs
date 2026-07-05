

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};


pub const ACTIVITY_CAP: usize = 1000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ActivityLevel {
    Info,
    Success,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ActivitySource {
    Capture,
    Mark,
    Verify,
    Batch,
    Identity,
    Device,
    Rules,
    Vault,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    pub id: String,
    pub epoch_ms: u64,
    pub level: ActivityLevel,
    pub source: ActivitySource,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl ActivityEvent {
    pub fn new(
        level: ActivityLevel,
        source: ActivitySource,
        message: impl Into<String>,
        details: Option<String>,
    ) -> Self {
        let epoch_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            epoch_ms,
            level,
            source,
            message: message.into(),
            details,
        }
    }
}
