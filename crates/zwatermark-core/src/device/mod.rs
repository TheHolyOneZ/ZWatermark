

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Default, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DeviceKind {
    #[default]
    Workstation,
    Laptop,
    Camera,
    Phone,
    Server,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: uuid::Uuid,
    pub name: String,
    pub kind: DeviceKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind_label: Option<String>,
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
    pub created_epoch_s: u64,
}

impl Device {
    pub fn new(
        name: &str,
        kind: DeviceKind,
        kind_label: Option<String>,
        metadata: BTreeMap<String, String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4(),
            name: name.to_string(),
            kind,
            kind_label,
            metadata,
            created_epoch_s: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        }
    }


    pub fn device_id_bits(&self) -> [u8; 2] {
        device_id_bits_from_uuid(self.id)
    }
}

pub fn device_id_bits_from_uuid(id: uuid::Uuid) -> [u8; 2] {
    let hash = blake3::hash(id.as_bytes());
    let mut out = [0u8; 2];
    out.copy_from_slice(&hash.as_bytes()[..2]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_id_bits_stable_for_same_uuid() {
        let id = uuid::Uuid::parse_str("00000000-0000-0000-0000-000000000000").unwrap();
        let a = device_id_bits_from_uuid(id);
        let b = device_id_bits_from_uuid(id);
        assert_eq!(a, b);
    }

    #[test]
    fn different_uuids_produce_different_bits() {

        let a = device_id_bits_from_uuid(uuid::Uuid::new_v4());
        let b = device_id_bits_from_uuid(uuid::Uuid::new_v4());
        assert_ne!(a, b);
    }
}
