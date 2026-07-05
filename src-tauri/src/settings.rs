use serde::{Deserialize, Serialize};
use zwatermark_core::overlay::VisibleOverlay;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub capture_watched_folders: Vec<String>,
    pub default_strength: Strength,
    #[serde(default)]
    pub default_overlay: VisibleOverlay,
    #[serde(default)]
    pub timestamps: TimestampSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            capture_watched_folders: Vec::new(),
            default_strength: Strength::Both,
            default_overlay: VisibleOverlay::default(),
            timestamps: TimestampSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Strength { Robust, Fragile, Both, Max }


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampSettings {

    pub default_request: bool,


    pub tsa_urls: Vec<String>,


    #[serde(default = "default_ots_calendars")]
    pub ots_calendar_urls: Vec<String>,


    #[serde(default)]
    pub asked_first_time_consent: bool,
}

fn default_ots_calendars() -> Vec<String> {
    vec![
        "https://alice.btc.calendar.opentimestamps.org".to_string(),
        "https://bob.btc.calendar.opentimestamps.org".to_string(),
        "https://finney.calendar.eternitywall.com".to_string(),
    ]
}

impl Default for TimestampSettings {
    fn default() -> Self {
        Self {
            default_request: true,
            tsa_urls: vec![
                "https://freetsa.org/tsr".to_string(),
                "http://timestamp.digicert.com".to_string(),
            ],
            ots_calendar_urls: default_ots_calendars(),
            asked_first_time_consent: false,
        }
    }
}
