mod activity;
mod capture;
mod commands;
mod identity;
mod ipc;
mod rules;
mod settings;
mod state;

use std::path::PathBuf;

use tauri::{Emitter, Manager};

use crate::activity::{ActivityLevel, ActivitySource};


fn effective_watch_dirs(state: &state::AppState) -> Vec<PathBuf> {
    let configured: Vec<PathBuf> = state
        .settings
        .read()
        .map(|s| {
            s.capture_watched_folders
                .iter()
                .filter(|s| !s.trim().is_empty())
                .map(PathBuf::from)
                .collect()
        })
        .unwrap_or_default();
    let mut dirs = configured;
    if dirs.is_empty() {
        dirs = capture::default_capture_dirs();
    }
    dirs.sort();
    dirs.dedup();
    dirs
}


pub(crate) fn rebuild_capture_watcher(handle: &tauri::AppHandle) {
    let state = match handle.try_state::<state::AppState>() {
        Some(s) => s,
        None => return,
    };


    if let Ok(mut guard) = state.capture_watcher.lock() {
        *guard = None;
    }

    let dirs = effective_watch_dirs(&state);
    if dirs.is_empty() {
        tracing::warn!("no capture directories to watch");
        state.log(
            ActivityLevel::Warning,
            ActivitySource::Capture,
            "No screenshot folders to watch",
            Some("Add one under Settings > Capture watched folders.".into()),
        );
        return;
    }

    match capture::start_watcher(&dirs) {
        Ok((watcher, mut rx)) => {
            let watched_desc = dirs
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ");
            state.log(
                ActivityLevel::Info,
                ActivitySource::Capture,
                format!("Watching {} folder(s) for screenshots", dirs.len()),
                Some(watched_desc),
            );

            let handle_c = handle.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    tracing::info!(path = %event.path.display(), "capture detected");
                    let entry = crate::ipc::dto::CaptureLogEntry {
                        id: uuid::Uuid::new_v4().to_string(),
                        path: event.path.to_string_lossy().into_owned(),
                        thumbnail_data_url: None,
                        epoch_ms: event.epoch_ms,
                        strength: String::new(),
                        payload_bits: 0,
                        verified: false,
                    };
                    if let Some(state) = handle_c.try_state::<state::AppState>() {
                        state.push_capture(entry.clone());
                        let name = std::path::Path::new(&entry.path)
                            .file_name()
                            .and_then(|s| s.to_str())
                            .unwrap_or(&entry.path)
                            .to_string();
                        state.log(
                            ActivityLevel::Info,
                            ActivitySource::Capture,
                            format!("New screenshot detected: {name}"),
                            Some(entry.path.clone()),
                        );
                    }
                    let _ = handle_c.emit("capture:detected", &entry);
                }
            });

            if let Ok(mut guard) = state.capture_watcher.lock() {
                *guard = Some(Box::new(watcher));
            } else {


                std::mem::forget(watcher);
            }
        }
        Err(e) => {
            tracing::error!(error = %e, "capture watcher failed to start");
            state.log(
                ActivityLevel::Error,
                ActivitySource::Capture,
                "Capture watcher failed to start",
                Some(e.to_string()),
            );
        }
    }
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let open = MenuItem::with_id(app, "open", "Open ZWatermark", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit ZWatermark", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open, &sep, &quit])?;

    let h1 = app.handle().clone();
    let h2 = app.handle().clone();

    let tray_icon = app
        .default_window_icon()
        .cloned()
        .ok_or("no app icon")?;


    if let Some(state) = app.handle().try_state::<state::AppState>() {
        let _ = state.app_handle.set(app.handle().clone());
        state.log(
            ActivityLevel::Info,
            ActivitySource::System,
            "ZWatermark started",
            None,
        );
    }

    rebuild_capture_watcher(app.handle());

    TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon)
        .icon_as_template(false)
        .tooltip("ZWatermark")
        .menu(&menu)
        .on_menu_event(move |_tray, event| match event.id.as_ref() {
            "open" => {
                if let Some(w) = h1.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => h1.exit(0),
            _ => {}
        })
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(w) = h2.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .try_init()
        .ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .manage(state::AppState::new())
        .setup(|app| setup_app(app))
        .invoke_handler(tauri::generate_handler![
            commands::identity::identity_list,
            commands::identity::identity_generate,
            commands::identity::identity_update,
            commands::identity::identity_delete,
            commands::identity::identity_export,
            commands::identity::identity_import,
            commands::migration::migration_take_legacy_flag,
            commands::verify::verify_image,
            commands::mark::mark_image,
            commands::captures::captures_recent,
            commands::activity::activity_recent,
            commands::rules::rules_get,
            commands::rules::rules_set,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::batch::batch_verify,
            commands::batch::batch_export_csv,
            commands::batch::batch_mark,
            commands::batch::batch_cancel,
            commands::registry::registry_publish,
            commands::registry::registry_import,
            commands::vault::vault_status,
            commands::vault::vault_enable,
            commands::vault::vault_disable,
            commands::vault::vault_unlock,
            commands::vault::vault_change_password,
            commands::device::device_list,
            commands::device::device_create,
            commands::device::device_update,
            commands::device::device_delete,
            commands::stress::stress_start,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZWatermark");
}
