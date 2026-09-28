//! A small log file (`%APPDATA%\SideDeck\sidedeck.log`) of what the
//! connection supervisor saw and did. Problems like "after a reboot the phone
//! only came back after replugging the cable" happen when nobody is watching,
//! so this is the only way to find out afterwards what went on.

use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

/// Past this size the file is renamed to `sidedeck.old.log` and restarted,
/// so the pair never takes more than about 1 MB.
const MAX_BYTES: u64 = 512 * 1024;

static LOCK: Mutex<()> = Mutex::new(());

fn log_path() -> PathBuf {
    crate::paths::data_dir().join("sidedeck.log")
}

fn timestamp() -> String {
    // SAFETY: plain query with no arguments.
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}",
        t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond, t.wMilliseconds
    )
}

pub fn write(message: &str) {
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = log_path();
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > MAX_BYTES) {
        let _ = std::fs::rename(&path, path.with_file_name("sidedeck.old.log"));
    }
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{} {message}", timestamp());
    }
}

/// `log!("adb restarted after {}s", secs)`
macro_rules! log {
    ($($arg:tt)*) => {
        $crate::log::write(&format!($($arg)*))
    };
}
pub(crate) use log;
