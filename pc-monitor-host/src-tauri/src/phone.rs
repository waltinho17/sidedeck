//! Phone detection and installing the dashboard app (kiosk APK) over USB.

use std::ffi::OsStr;

use serde::Serialize;

use crate::adb_bridge::{device_state, run_adb};
use crate::i18n::tr;
use crate::paths;

pub const KIOSK_PACKAGE: &str = "com.sidedeck.display";
pub const KIOSK_ACTIVITY: &str = "com.sidedeck.display/.MainActivity";
/// Package name used by test builds before the SideDeck name.
const LEGACY_PACKAGE: &str = "com.nzxt.kiosk";

#[derive(Serialize)]
pub struct PhoneStatus {
    /// "none" | "unauthorized" | "offline" | "ready"
    pub state: String,
    pub model: String,
    pub app_installed: bool,
    pub apk_available: bool,
}

fn adb_output(args: &[&str]) -> Option<String> {
    let output = run_adb(args).ok()?;
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

pub fn status() -> PhoneStatus {
    let state = device_state().to_string();
    let mut status = PhoneStatus {
        state,
        model: String::new(),
        app_installed: false,
        apk_available: paths::kiosk_apk().exists(),
    };
    if status.state != "ready" {
        return status;
    }

    status.model = adb_output(&["shell", "getprop", "ro.product.model"])
        .map(|m| m.trim().to_string())
        .unwrap_or_default();
    status.app_installed = is_installed(KIOSK_PACKAGE);
    status
}

pub fn is_kiosk_installed() -> bool {
    is_installed(KIOSK_PACKAGE)
}

fn is_installed(package: &str) -> bool {
    adb_output(&["shell", "pm", "list", "packages", package])
        .is_some_and(|out| out.lines().any(|line| line.trim() == format!("package:{package}")))
}

/// Installs (or updates, keeping its data) the bundled APK and opens it.
pub fn install_kiosk() -> Result<(), String> {
    let apk = paths::kiosk_apk();
    if !apk.exists() {
        return Err(missing_apk());
    }

    let output = run_adb([OsStr::new("install"), OsStr::new("-r"), apk.as_os_str()])
        .map_err(|e| format!("{}: {e}", tr("não foi possível rodar o adb", "couldn't run adb")))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() || !stdout.contains("Success") {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(explain_install_error(&format!("{stdout}{stderr}")));
    }

    // Make sure what landed on the phone really is SideDeck Display before
    // touching anything else (a stale APK once installed the legacy package,
    // which the cleanup below then removed again).
    if !is_installed(KIOSK_PACKAGE) {
        return Err(tr(
            "o instalador enviado não é o SideDeck Display (APK desatualizado no programa)",
            "the installed package isn't SideDeck Display (the APK bundled with the program is outdated)",
        )
        .into());
    }

    // Test builds from before the rename registered as a home app too; drop
    // them so the phone doesn't end up with two panel apps.
    let _ = run_adb(["uninstall", LEGACY_PACKAGE]);

    open_kiosk();
    Ok(())
}

/// Turns adb's failure codes into what the user should actually do.
fn explain_install_error(output: &str) -> String {
    let known = [
        (
            "INSTALL_FAILED_USER_RESTRICTED",
            tr(
                "o celular recusou a instalação pelo USB. Se apareceu um aviso na tela do celular, toque em \"Instalar\" e tente de novo. Em Xiaomi, Redmi e POCO é preciso ligar \"Instalar via USB\" nas Opções do desenvolvedor",
                "the phone refused the install over USB. If a prompt showed up on the phone, tap \"Install\" and try again. On Xiaomi, Redmi and POCO, turn on \"Install via USB\" in Developer options",
            ),
        ),
        (
            "INSTALL_FAILED_UPDATE_INCOMPATIBLE",
            tr(
                "já existe um SideDeck Display de outra versão no celular. Desinstale ele no celular e tente de novo",
                "the phone already has a SideDeck Display from a different build. Uninstall it on the phone and try again",
            ),
        ),
        (
            "INSTALL_FAILED_VERSION_DOWNGRADE",
            tr(
                "o celular já tem uma versão mais nova do SideDeck Display",
                "the phone already has a newer SideDeck Display",
            ),
        ),
        ("INSTALL_FAILED_INSUFFICIENT_STORAGE", tr("falta espaço no celular", "the phone is out of storage")),
        (
            "INSTALL_FAILED_OLDER_SDK",
            tr(
                "o Android deste celular é antigo demais (precisa do Android 7 ou mais novo)",
                "this phone's Android is too old (Android 7 or newer is required)",
            ),
        ),
        ("device offline", tr("o celular desconectou durante a instalação", "the phone disconnected during the install")),
        ("no devices", tr("nenhum celular conectado", "no phone connected")),
        ("unauthorized", tr("o celular ainda não autorizou este computador", "the phone hasn't authorized this computer yet")),
    ];
    for (code, message) in known {
        if output.contains(code) {
            return message.to_string();
        }
    }
    output
        .trim()
        .lines()
        .last()
        .unwrap_or(tr("falha desconhecida", "unknown error"))
        .to_string()
}

/// Where `copy_apk_to_phone` puts the file: the Downloads folder every file
/// manager shows.
const PHONE_APK_PATH: &str = "/sdcard/Download/SideDeck-Display.apk";

/// Fallback when `adb install` is blocked (some phones refuse installs over
/// USB): copy the APK to the phone so it can be installed by tapping it.
pub fn copy_apk_to_phone() -> Result<String, String> {
    let apk = paths::kiosk_apk();
    if !apk.exists() {
        return Err(missing_apk());
    }
    let output = run_adb([OsStr::new("push"), apk.as_os_str(), OsStr::new(PHONE_APK_PATH)])
        .map_err(|e| format!("{}: {e}", tr("não foi possível rodar o adb", "couldn't run adb")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.trim().lines().last().unwrap_or(tr("falha ao copiar", "copy failed")).to_string());
    }
    Ok("Download/SideDeck-Display.apk".into())
}

/// Last resort, no USB needed: show the APK in Explorer so it can be sent to
/// the phone any other way (cable file transfer, messaging app, cloud...).
pub fn reveal_apk() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let apk = paths::kiosk_apk();
    if !apk.exists() {
        return Err(missing_apk());
    }
    std::process::Command::new("explorer")
        .raw_arg(format!("/select,\"{}\"", apk.display()))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn missing_apk() -> String {
    tr(
        "o APK do painel não veio junto com o programa",
        "the panel APK is missing from the program folder",
    )
    .into()
}

pub fn open_kiosk() {
    let _ = run_adb(["shell", "am", "start", "-n", KIOSK_ACTIVITY]);
}
