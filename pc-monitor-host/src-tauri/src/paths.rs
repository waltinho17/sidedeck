//! Where the app finds its files, in development and once installed.
//!
//! - Dashboard pages (html/css/js/fonts): in a debug build they are read
//!   straight from `src/`, so frontend edits show up without rebuilding; an
//!   installed build reads the copies bundled under `<resources>/web`.
//! - Bundled tools and defaults (`adb/`, `android/kiosk.apk`, `videos/`) live
//!   in `src-tauri/` during development and under the resource dir when
//!   installed.
//! - The video gallery is user data, so it lives in %APPDATA% (Program Files
//!   isn't writable), seeded with the default videos (and with new defaults
//!   when an update brings some).

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static RESOURCE_BASE: OnceLock<PathBuf> = OnceLock::new();

/// Called once from the Tauri setup hook, before anything reads a path.
pub fn init(resource_dir: Option<PathBuf>) {
    let base = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    } else {
        resource_dir.unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
    };
    let _ = RESOURCE_BASE.set(base);
    seed_videos();
}

fn resource_base() -> &'static Path {
    RESOURCE_BASE
        .get()
        .map(PathBuf::as_path)
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")))
}

pub fn web_root() -> PathBuf {
    if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("src")
    } else {
        resource_base().join("web")
    }
}

pub fn bundled_adb() -> PathBuf {
    resource_base().join("adb").join("adb.exe")
}

pub fn kiosk_apk() -> PathBuf {
    resource_base().join("android").join("SideDeck-Display.apk")
}

fn appdata() -> PathBuf {
    PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into()))
}

pub fn data_dir() -> PathBuf {
    appdata().join("SideDeck")
}

/// Before the SideDeck name the data folder was "pc-monitor-host"; move it
/// over once so existing settings and videos survive the rename. Runs before
/// settings are loaded.
pub fn migrate_legacy_data_dir() {
    let legacy = appdata().join("pc-monitor-host");
    let current = data_dir();
    if legacy.exists() && !current.exists() {
        let _ = std::fs::rename(legacy, current);
    }
}

pub fn videos_dir() -> PathBuf {
    data_dir().join("videos")
}

/// Bundled videos already offered to this gallery, one name per line. A
/// default the user deleted is listed here, so it doesn't come back; one
/// added in a newer version isn't, so it gets copied in.
const SEEDED_LIST: &str = ".defaults";
/// The defaults of the versions that predate the list: a gallery that
/// already exists without it has seen these.
const FIRST_DEFAULTS: [&str; 4] = ["1.webm", "2.webm", "3.webm", "4.webm"];

/// Copies bundled videos the gallery hasn't been offered yet.
fn seed_videos() {
    let target = videos_dir();
    let list_path = target.join(SEEDED_LIST);
    let mut seeded: Vec<String> = match std::fs::read_to_string(&list_path) {
        Ok(text) => text.lines().map(str::to_string).collect(),
        Err(_) if target.exists() => FIRST_DEFAULTS.iter().map(|s| s.to_string()).collect(),
        Err(_) => Vec::new(),
    };
    if std::fs::create_dir_all(&target).is_err() {
        return;
    }
    let Ok(entries) = std::fs::read_dir(resource_base().join("videos")) else {
        return;
    };
    let before = seeded.len();
    for entry in entries.flatten() {
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if seeded.contains(&name) {
            continue;
        }
        let destination = target.join(&name);
        if destination.exists() || std::fs::copy(entry.path(), &destination).is_ok() {
            seeded.push(name);
        }
    }
    if seeded.len() != before || !list_path.exists() {
        let _ = std::fs::write(&list_path, seeded.join("\n"));
    }
}
