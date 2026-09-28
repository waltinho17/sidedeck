//! Keeps the phone connected without anyone touching it.
//!
//! A supervisor loop watches the USB device and:
//! - keeps the `adb reverse tcp:8080` tunnel up (it is lost whenever the
//!   phone or the adb server reconnects);
//! - revives a device stuck "offline" (`adb reconnect offline`, then a full
//!   adb server restart), and restarts the server when adb stops seeing a
//!   phone that Windows still has plugged in (after a reboot or sleep);
//! - in dedicated-screen mode (a phone mounted inside the case), wakes the
//!   screen, gets past a lock screen without a PIN, makes the panel the home
//!   app and brings it back to the front if something else opens.

use std::ffi::OsStr;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Output};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::i18n::tr;
use crate::log::log;
use crate::phone;
use crate::settings::AppState;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const LOOP_INTERVAL: Duration = Duration::from_secs(3);
/// How long a device may stay "offline" before `adb reconnect`, and before a
/// full server restart.
const OFFLINE_RECONNECT_AFTER: Duration = Duration::from_secs(6);
const OFFLINE_RESTART_AFTER: Duration = Duration::from_secs(20);
/// adb listing no phone for this long gets a server restart, if Windows does
/// have one plugged in with USB debugging on (or one was connected before).
const MISSING_RESTART_AFTER: Duration = Duration::from_secs(8);
/// Never restart the adb server more often than this.
const RESTART_COOLDOWN: Duration = Duration::from_secs(45);
/// Dedicated mode: how often to check the panel is on screen.
const FOREGROUND_CHECK_EVERY: Duration = Duration::from_secs(10);

/// The adb shipped with the app comes first, so testers don't need the
/// Android SDK; a developer's SDK copy or one on PATH are fallbacks.
pub fn find_adb() -> PathBuf {
    let bundled = crate::paths::bundled_adb();
    if bundled.exists() {
        return bundled;
    }
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        let candidate = PathBuf::from(local_appdata)
            .join("Android")
            .join("Sdk")
            .join("platform-tools")
            .join("adb.exe");
        if candidate.exists() {
            return candidate;
        }
    }
    PathBuf::from("adb")
}

/// Only one adb client runs at a time. When SideDeck starts with Windows no
/// adb server is running yet, and two clients at once (the supervisor and the
/// settings window's status poll) each spawn one. The loser exits, but can
/// grab the phone's USB interface on its way out, and the server that stays
/// up then lists no phone until the cable is replugged.
static ADB_LOCK: Mutex<()> = Mutex::new(());

/// Runs adb without flashing a console window.
pub fn run_adb<I, S>(args: I) -> std::io::Result<Output>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let _guard = ADB_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    Command::new(find_adb())
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
}

fn adb(args: &[&str]) -> Option<String> {
    let output = run_adb(args).ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Whether Windows has a device with an adb interface plugged in: the
/// interface class adb itself looks for (ANDROID_USB_CLASS_ID), registered by
/// every phone with USB debugging on, whatever its driver. It tells "no phone
/// plugged in" apart from "adb lost track of the phone".
pub fn adb_usb_present() -> bool {
    use windows::core::{GUID, PCWSTR};
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInterfaces, SetupDiGetClassDevsW,
        DIGCF_DEVICEINTERFACE, DIGCF_PRESENT, SP_DEVICE_INTERFACE_DATA,
    };
    use windows::Win32::Foundation::HWND;

    const ANDROID_USB_CLASS_ID: GUID = GUID::from_u128(0xf72fe0d4_cbcb_407d_8814_9ed673d0dd6b);
    // SAFETY: the device info set is only used between its creation and
    // destruction below, with a correctly sized interface data struct.
    unsafe {
        let Ok(set) = SetupDiGetClassDevsW(
            Some(&ANDROID_USB_CLASS_ID),
            PCWSTR::null(),
            HWND::default(),
            DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
        ) else {
            return false;
        };
        let mut data = SP_DEVICE_INTERFACE_DATA {
            cbSize: std::mem::size_of::<SP_DEVICE_INTERFACE_DATA>() as u32,
            ..Default::default()
        };
        let found = SetupDiEnumDeviceInterfaces(set, None, &ANDROID_USB_CLASS_ID, 0, &mut data).is_ok();
        let _ = SetupDiDestroyDeviceInfoList(set);
        found
    }
}

/// "ready" | "offline" | "unauthorized" | "none", for the first device.
pub fn device_state() -> &'static str {
    let Some(listing) = adb(&["devices"]) else {
        return "none";
    };
    listing
        .lines()
        .skip(1)
        .filter_map(|line| line.split_whitespace().nth(1))
        .next()
        .map(|state| match state {
            "device" => "ready",
            "unauthorized" => "unauthorized",
            _ => "offline",
        })
        .unwrap_or("none")
}

/// Sets up the tunnel only when it is missing, so a healthy connection isn't
/// touched every few seconds.
fn ensure_reverse() -> bool {
    let active = adb(&["reverse", "--list"]).is_some_and(|list| list.contains("tcp:8080 tcp:8080"));
    active || adb(&["reverse", "tcp:8080", "tcp:8080"]).is_some()
}

fn restart_server() {
    let _ = adb(&["kill-server"]);
    let _ = adb(&["start-server"]);
}

/// The first adb call starts the server; doing it here, once and on purpose,
/// keeps it from happening in the middle of whatever else runs at startup.
fn start_server() {
    let _ = adb(&["start-server"]);
}

/// Waits a few seconds for the device to show up as ready.
fn wait_ready(timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if device_state() == "ready" {
            return true;
        }
        std::thread::sleep(Duration::from_millis(700));
    }
    false
}

fn screen_awake() -> bool {
    adb(&["shell", "dumpsys", "power"]).is_some_and(|out| out.contains("mWakefulness=Awake"))
}

fn panel_in_front() -> bool {
    adb(&["shell", "dumpsys", "activity", "activities"]).is_some_and(|out| {
        out.lines()
            .filter(|line| line.contains("ResumedActivity"))
            .any(|line| line.contains(phone::KIOSK_PACKAGE))
    })
}

/// Screen on, past a swipe-only lock screen, panel in front. (With a PIN the
/// panel still shows over the lock screen: the app asks for that itself.)
fn bring_panel_up() {
    let asleep = !screen_awake();
    if asleep {
        // Refused on MIUI without "USB debugging (security settings)"; the
        // app then turns the screen on itself when opened below.
        let _ = adb(&["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
        // Only right after waking: on a phone with a PIN this brings up the
        // PIN pad, which shouldn't pop up every few seconds.
        let _ = adb(&["shell", "wm", "dismiss-keyguard"]);
    }
    if asleep || !panel_in_front() {
        phone::open_kiosk();
    }
}

/// Dedicated mode, once per connection: the panel becomes the home app, so
/// the phone also boots straight into it.
fn make_panel_home() {
    let _ = adb(&["shell", "cmd", "package", "set-home-activity", phone::KIOSK_ACTIVITY]);
}

/// Dedicated mode switched off: if the panel is still the phone's home app,
/// hand that back to the phone's own launcher.
fn release_panel_home() {
    let current = adb(&[
        "shell", "cmd", "package", "resolve-activity", "--brief",
        "-a", "android.intent.action.MAIN", "-c", "android.intent.category.HOME",
    ]);
    if !current.is_some_and(|out| out.contains(phone::KIOSK_PACKAGE)) {
        return;
    }
    let Some(listing) = adb(&[
        "shell", "cmd", "package", "query-activities", "--brief",
        "-a", "android.intent.action.MAIN", "-c", "android.intent.category.HOME",
    ]) else {
        return;
    };
    // `--brief` prints "package/activity" per line; skip ours and Android's
    // placeholder launcher.
    let launcher = listing
        .lines()
        .map(str::trim)
        .filter(|line| line.contains('/'))
        .find(|line| !line.starts_with(phone::KIOSK_PACKAGE) && !line.contains("FallbackHome"));
    if let Some(launcher) = launcher {
        let _ = adb(&["shell", "cmd", "package", "set-home-activity", launcher]);
    }
}

/// The "Reconectar" button: everything the supervisor would do, right now and
/// in the strongest form. Returns what happened, for the settings screen.
pub fn recover(dedicated: bool) -> Result<String, String> {
    if device_state() != "ready" {
        let _ = adb(&["reconnect", "offline"]);
        if !wait_ready(Duration::from_secs(4)) {
            restart_server();
            if !wait_ready(Duration::from_secs(10)) {
                return Err(match device_state() {
                    "unauthorized" => tr(
                        "o celular não autorizou este computador — toque em \"Permitir\" no aviso de depuração USB",
                        "the phone hasn't authorized this computer — tap \"Allow\" on the USB debugging prompt",
                    ),
                    "offline" => tr(
                        "o celular aparece, mas não responde. Se continuar assim, é preciso desconectar e conectar o cabo",
                        "the phone shows up but doesn't respond. If it stays like this, unplug and plug the cable back in",
                    ),
                    _ => tr(
                        "nenhum celular encontrado no USB. Confira o cabo e se a depuração USB está ligada",
                        "no phone found on USB. Check the cable and that USB debugging is on",
                    ),
                }
                .into());
            }
        }
    }
    if !ensure_reverse() {
        return Err(tr(
            "o celular está conectado, mas o túnel adb reverse falhou",
            "the phone is connected, but the adb reverse tunnel failed",
        )
        .into());
    }
    if phone::is_kiosk_installed() {
        if dedicated {
            make_panel_home();
        } else {
            release_panel_home();
        }
        bring_panel_up();
        Ok(tr("Conectado — painel aberto no celular", "Connected — panel opened on the phone").into())
    } else {
        Ok(tr("Conectado — falta instalar o app do painel", "Connected — the panel app still needs to be installed").into())
    }
}

#[derive(Default)]
struct Supervisor {
    was_ready: bool,
    was_dedicated: bool,
    seen_device: bool,
    last_state: &'static str,
    offline_since: Option<Instant>,
    missing_since: Option<Instant>,
    /// Restarts done since the phone went missing without Windows seeing it
    /// (a fallback in case the Windows check misses some phone).
    blind_restarts: u32,
    reconnect_tried: bool,
    last_restart: Option<Instant>,
    last_foreground_check: Option<Instant>,
}

impl Supervisor {
    fn can_restart(&self) -> bool {
        self.last_restart.map_or(true, |t| t.elapsed() >= RESTART_COOLDOWN)
    }

    fn restart(&mut self, reason: &str) {
        log!("reiniciando o servidor adb: {reason}");
        restart_server();
        self.last_restart = Some(Instant::now());
    }

    fn tick(&mut self, dedicated: bool) -> bool {
        let state = device_state();
        if state != self.last_state {
            log!("celular: {} -> {state}", if self.last_state.is_empty() { "?" } else { self.last_state });
            self.last_state = state;
        }
        if state != "offline" {
            self.offline_since = None;
            self.reconnect_tried = false;
        }
        if state != "none" {
            self.missing_since = None;
            self.blind_restarts = 0;
        }

        match state {
            "ready" => {
                self.seen_device = true;
                let tunnel = ensure_reverse();
                if !tunnel {
                    log!("adb reverse falhou");
                }
                if (!self.was_ready || self.was_dedicated != dedicated) && phone::is_kiosk_installed() {
                    // Just plugged in, the PC just booted, adb came back, or
                    // the option was switched.
                    if dedicated {
                        log!("tela dedicada: painel como app de início e na frente");
                        make_panel_home();
                        bring_panel_up();
                        self.last_foreground_check = Some(Instant::now());
                    } else {
                        release_panel_home();
                    }
                }
                self.was_dedicated = dedicated;
                let due = self
                    .last_foreground_check
                    .map_or(true, |t| t.elapsed() >= FOREGROUND_CHECK_EVERY);
                if dedicated && due {
                    self.last_foreground_check = Some(Instant::now());
                    if phone::is_kiosk_installed() {
                        bring_panel_up();
                    }
                }
                self.was_ready = true;
                return tunnel;
            }
            "offline" => {
                let since = *self.offline_since.get_or_insert_with(Instant::now);
                if since.elapsed() >= OFFLINE_RECONNECT_AFTER && !self.reconnect_tried {
                    log!("celular offline há {}s: adb reconnect offline", since.elapsed().as_secs());
                    let _ = adb(&["reconnect", "offline"]);
                    self.reconnect_tried = true;
                } else if since.elapsed() >= OFFLINE_RESTART_AFTER && self.can_restart() {
                    self.restart("celular continua offline");
                }
            }
            "none" => {
                let since = *self.missing_since.get_or_insert_with(Instant::now);
                if since.elapsed() >= MISSING_RESTART_AFTER && self.can_restart() {
                    if adb_usb_present() {
                        // Right after Windows starts this is the usual case:
                        // the phone is on the cable, adb just doesn't list it.
                        self.restart("o Windows vê o celular no USB, mas o adb não");
                    } else if self.seen_device && self.blind_restarts < 2 {
                        self.blind_restarts += 1;
                        self.restart("o celular sumiu do adb");
                    }
                }
            }
            // Only a tap on the phone fixes this; the settings screen says so.
            _ => {}
        }
        self.was_ready = false;
        false
    }
}

pub fn start_bridge_loop(state: Arc<AppState>) {
    std::thread::spawn(move || {
        start_server();
        let mut supervisor = Supervisor::default();
        loop {
            let dedicated = state.get_settings().dedicated_screen;
            let connected = supervisor.tick(dedicated);
            state.set_adb_connected(connected);
            std::thread::sleep(LOOP_INTERVAL);
        }
    });
}
