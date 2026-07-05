

use std::path::PathBuf;


pub fn screenshot_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let home = std::env::var("HOME").ok().map(PathBuf::from).or_else(dirs::home_dir);

    if let Ok(pics) = std::env::var("XDG_PICTURES_DIR") {
        dirs.push(PathBuf::from(pics));
    } else if let Some(h) = &home {
        dirs.push(h.join("Pictures"));
    }

    if let Some(h) = &home {
        dirs.push(h.join("Pictures").join("Screenshots"));
        dirs.push(h.join("Screenshots"));

        dirs.push(h.join("Bilder"));
        dirs.push(h.join("Bilder").join("Bildschirmfotos"));
    }

    dirs.into_iter().collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect()
}
