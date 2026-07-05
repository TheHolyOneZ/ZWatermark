

#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "windows")]
pub mod windows;
#[cfg(target_os = "macos")]
pub mod macos;

use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;


const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp"];


const DEBOUNCE: Duration = Duration::from_millis(150);

#[derive(Debug, Clone)]
pub struct CaptureEvent {
    pub path: PathBuf,
    pub epoch_ms: u64,
}


pub struct CaptureWatcher {
    _watcher: notify::RecommendedWatcher,
}


pub fn start_watcher(
    dirs: &[PathBuf],
) -> notify::Result<(CaptureWatcher, mpsc::Receiver<CaptureEvent>)> {
    let (tx, rx) = mpsc::channel::<CaptureEvent>(32);
    let dedupe: Arc<Mutex<Vec<(PathBuf, Instant)>>> = Arc::new(Mutex::new(Vec::new()));

    let dedupe_cloned = dedupe.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
            return;
        }
        for p in event.paths {
            if !is_image(&p) { continue; }
            if !recently_stable(&p) { continue; }
            if !should_emit(&dedupe_cloned, &p) { continue; }
            let epoch_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let ev = CaptureEvent {
                path: p.clone(),
                epoch_ms,
            };
            let _ = tx.try_send(ev);
        }
    })?;

    for dir in dirs {
        if dir.exists() {
            watcher.watch(dir, RecursiveMode::NonRecursive)?;
            tracing::info!(?dir, "watching for screenshots");
        } else {
            tracing::warn!(?dir, "capture dir does not exist — skipping");
        }
    }

    Ok((CaptureWatcher { _watcher: watcher }, rx))
}


pub fn default_capture_dirs() -> Vec<PathBuf> {
    #[cfg(target_os = "linux")]
    { linux::screenshot_dirs() }
    #[cfg(target_os = "windows")]
    { windows::screenshot_dirs() }
    #[cfg(target_os = "macos")]
    { macos::screenshot_dirs() }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    { Vec::new() }
}

fn is_image(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let lc = e.to_ascii_lowercase();
            IMAGE_EXTS.contains(&lc.as_str())
        })
        .unwrap_or(false)
}


fn recently_stable(p: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(p) else { return false };
    let Ok(mtime) = meta.modified() else { return true };
    let Ok(age) = SystemTime::now().duration_since(mtime) else { return true };
    age >= Duration::from_millis(30)
}


fn should_emit(dedupe: &Arc<Mutex<Vec<(PathBuf, Instant)>>>, p: &Path) -> bool {
    let mut guard = match dedupe.lock() {
        Ok(g) => g,
        Err(_) => return true,
    };
    let now = Instant::now();
    guard.retain(|(_, t)| now.duration_since(*t) < Duration::from_secs(30));
    if guard.iter().any(|(existing, t)| existing == p && now.duration_since(*t) < DEBOUNCE) {
        return false;
    }
    guard.push((p.to_path_buf(), now));
    true
}
