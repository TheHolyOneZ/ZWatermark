use crate::activity::{ActivityLevel, ActivitySource};
use crate::ipc::dto::DeviceSummary;
use crate::state::AppState;
use std::collections::BTreeMap;
use tauri::State;
use zwatermark_core::device::{Device, DeviceKind};
use zwatermark_core::store::{self, DeviceStore, IdentityStore};

fn parse_kind(s: &str) -> DeviceKind {
    match s.to_ascii_lowercase().as_str() {
        "laptop" => DeviceKind::Laptop,
        "camera" => DeviceKind::Camera,
        "phone" => DeviceKind::Phone,
        "server" => DeviceKind::Server,
        "custom" => DeviceKind::Custom,
        _ => DeviceKind::Workstation,
    }
}

fn kind_to_str(k: DeviceKind) -> &'static str {
    match k {
        DeviceKind::Workstation => "workstation",
        DeviceKind::Laptop => "laptop",
        DeviceKind::Camera => "camera",
        DeviceKind::Phone => "phone",
        DeviceKind::Server => "server",
        DeviceKind::Custom => "custom",
    }
}

fn to_dto(d: &Device) -> DeviceSummary {
    DeviceSummary {
        id: d.id.to_string(),
        name: d.name.clone(),
        kind: kind_to_str(d.kind).to_string(),
        kind_label: d.kind_label.clone(),
        metadata: d.metadata.clone(),
        created_epoch_s: d.created_epoch_s,
    }
}

fn normalize_kind_label(kind: DeviceKind, kind_label: Option<String>) -> Option<String> {
    if matches!(kind, DeviceKind::Custom) {
        kind_label
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    } else {
        None
    }
}

#[tauri::command]
pub async fn device_list() -> Result<Vec<DeviceSummary>, String> {
    let path = store::default_devices_path().map_err(|e| e.to_string())?;
    let store = DeviceStore::load(&path).map_err(|e| e.to_string())?;
    Ok(store.devices.iter().map(to_dto).collect())
}

#[tauri::command]
pub async fn device_create(
    state: State<'_, AppState>,
    name: String,
    kind: String,
    kind_label: Option<String>,
    metadata: BTreeMap<String, String>,
) -> Result<DeviceSummary, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("device name required".into());
    }
    let parsed_kind = parse_kind(&kind);
    let kind_label = normalize_kind_label(parsed_kind, kind_label);
    let device = Device::new(&name, parsed_kind, kind_label, metadata);
    let path = store::default_devices_path().map_err(|e| e.to_string())?;
    let mut store = DeviceStore::load(&path).map_err(|e| e.to_string())?;
    store.insert(device.clone());
    store.save(&path).map_err(|e| e.to_string())?;
    state.log(
        ActivityLevel::Info,
        ActivitySource::Device,
        format!("Added device \"{}\"", device.name),
        Some(device.id.to_string()),
    );
    Ok(to_dto(&device))
}

#[tauri::command]
pub async fn device_update(
    state: State<'_, AppState>,
    id: String,
    name: String,
    kind: String,
    kind_label: Option<String>,
    metadata: BTreeMap<String, String>,
) -> Result<DeviceSummary, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("device name required".into());
    }
    let uuid = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let path = store::default_devices_path().map_err(|e| e.to_string())?;
    let mut store = DeviceStore::load(&path).map_err(|e| e.to_string())?;
    let device = store
        .devices
        .iter_mut()
        .find(|d| d.id == uuid)
        .ok_or("device not found")?;
    let parsed_kind = parse_kind(&kind);
    device.name = name;
    device.kind = parsed_kind;
    device.kind_label = normalize_kind_label(parsed_kind, kind_label);
    device.metadata = metadata;
    let updated = device.clone();
    store.save(&path).map_err(|e| e.to_string())?;
    state.log(
        ActivityLevel::Info,
        ActivitySource::Device,
        format!("Updated device \"{}\"", updated.name),
        Some(updated.id.to_string()),
    );
    Ok(to_dto(&updated))
}

#[tauri::command]
pub async fn device_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let uuid = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;


    let idpath = store::default_identity_path().map_err(|e| e.to_string())?;
    let idstore = IdentityStore::load(&idpath).map_err(|e| e.to_string())?;
    let bound: Vec<String> = idstore
        .identities
        .iter()
        .filter(|i| i.default_device_id == Some(uuid))
        .map(|i| i.display_name.clone())
        .collect();
    if !bound.is_empty() {
        return Err(format!(
            "device is set as default for: {}",
            bound.join(", ")
        ));
    }

    let path = store::default_devices_path().map_err(|e| e.to_string())?;
    let mut store = DeviceStore::load(&path).map_err(|e| e.to_string())?;
    let device_name = store
        .find(&uuid)
        .map(|d| d.name.clone())
        .unwrap_or_else(|| uuid.to_string());
    if !store.remove(&uuid) {
        return Err("device not found".into());
    }
    store.save(&path).map_err(|e| e.to_string())?;
    state.log(
        ActivityLevel::Info,
        ActivitySource::Device,
        format!("Deleted device \"{device_name}\""),
        Some(uuid.to_string()),
    );
    Ok(())
}
