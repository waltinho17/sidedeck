//! Language of what the backend says to the user (errors and status shown in
//! the settings window, tray menu, window title) and of the phone panel.
//!
//! The setting is "auto" | "pt-BR" | "en"; "auto" follows the Windows display
//! language. Everything that isn't Portuguese gets English.

use std::sync::atomic::{AtomicBool, Ordering};

static ENGLISH: AtomicBool = AtomicBool::new(false);

/// "pt-BR" when Windows is displayed in Portuguese, "en" otherwise.
pub fn system_language() -> &'static str {
    const LANG_PORTUGUESE: u16 = 0x16;
    // SAFETY: plain query with no arguments.
    let lang_id = unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() };
    if lang_id & 0x3ff == LANG_PORTUGUESE {
        "pt-BR"
    } else {
        "en"
    }
}

/// Resolves the "auto" setting to a concrete language.
pub fn effective(setting: &str) -> &'static str {
    match setting {
        "pt-BR" => "pt-BR",
        "en" => "en",
        _ => system_language(),
    }
}

/// Called whenever settings are loaded or saved.
pub fn set_current(setting: &str) {
    ENGLISH.store(effective(setting) == "en", Ordering::Relaxed);
}

pub fn is_english() -> bool {
    ENGLISH.load(Ordering::Relaxed)
}

/// The message in the current language.
pub fn tr<'a>(pt: &'a str, en: &'a str) -> &'a str {
    if is_english() {
        en
    } else {
        pt
    }
}
