

use std::path::PathBuf;

pub fn screenshot_dirs() -> Vec<PathBuf> {
    let mut out = Vec::new();
    let home = std::env::var("HOME").ok().map(PathBuf::from).or_else(dirs::home_dir);
    if let Some(base) = home {
        out.push(base.join("Desktop"));
        out.push(base.join("Pictures").join("Screenshots"));
    }
    out
}
