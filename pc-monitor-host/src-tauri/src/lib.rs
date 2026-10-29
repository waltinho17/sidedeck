mod adb_bridge;
mod afterburner;
mod cpu_perf;
mod gpu_windows;
mod hardware;
mod i18n;
mod integrations;
mod log;
mod paths;
mod phone;
mod settings;
mod ws_server;

use std::os::windows::process::CommandExt;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

use settings::{AppState, Settings, MODELS};

#[tauri::command]
fn get_settings(state: tauri::State<Arc<AppState>>) -> Settings {
    state.get_settings()
}

/// What the dashboard page needs: shared settings with the active model's
/// theme/display flattened in.
#[tauri::command]
fn get_dashboard_config(state: tauri::State<Arc<AppState>>) -> serde_json::Value {
    state.get_settings().resolved()
}

#[tauri::command]
fn save_settings(app: AppHandle, state: tauri::State<Arc<AppState>>, settings: Settings) -> Result<(), String> {
    state.set_settings(settings).map_err(|e| e.to_string())?;
    apply_language(&app);
    Ok(())
}

/// The language picker applies at once, like the Windows startup switch,
/// without saving whatever else is being edited in the form.
#[tauri::command]
fn set_language(app: AppHandle, state: tauri::State<Arc<AppState>>, language: String) -> Result<(), String> {
    let mut settings = state.get_settings();
    settings.language = language;
    state.set_settings(settings).map_err(|e| e.to_string())?;
    apply_language(&app);
    Ok(())
}

/// "Usar este modelo" on the Modelos tab: switches the panel right away,
/// without saving whatever else is being edited in the form.
#[tauri::command]
fn set_dashboard_mode(state: tauri::State<Arc<AppState>>, model: String) -> Result<(), String> {
    if !MODELS.contains(&model.as_str()) {
        return Err(i18n::tr("modelo inválido", "invalid model").into());
    }
    let mut settings = state.get_settings();
    settings.dashboard_mode = model;
    state.set_settings(settings).map_err(|e| e.to_string())
}

/// Concrete language for the "auto" setting ("pt-BR" or "en").
#[tauri::command]
fn system_language() -> &'static str {
    i18n::system_language()
}

/// Tray menu entries, kept so their text can follow the language setting.
struct TrayItems {
    show: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

fn window_title() -> String {
    format!("SideDeck — {}", i18n::tr("Configurações", "Settings"))
}

/// Window title and tray menu in the current language.
fn apply_language(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&window_title());
    }
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.show.set_text(i18n::tr("Configurações", "Settings"));
        let _ = items.quit.set_text(i18n::tr("Sair", "Quit"));
    }
}

#[tauri::command]
fn reset_settings(state: tauri::State<Arc<AppState>>) -> Result<Settings, String> {
    // The language is a preference of the person, not part of the panel's look.
    let defaults = Settings {
        language: state.get_settings().language,
        ..Settings::default()
    };
    state
        .set_settings(defaults.clone())
        .map_err(|e| e.to_string())?;
    Ok(defaults)
}

#[tauri::command]
fn get_adb_status(state: tauri::State<Arc<AppState>>) -> bool {
    state.is_adb_connected()
}

/// Full recovery (reconnect, adb server restart, tunnel, open the panel).
/// Takes several seconds in the worst case, so it runs off the IPC thread.
#[tauri::command]
async fn reconnect_adb(state: tauri::State<'_, Arc<AppState>>) -> Result<String, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = adb_bridge::recover(state.get_settings().dedicated_screen);
        state.set_adb_connected(result.is_ok());
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_VALUE: &str = "SideDeck";
/// Passed by the Windows startup entry: start hidden in the tray.
const AUTOSTART_ARG: &str = "--autostart";

fn reg(args: &[&str]) -> bool {
    std::process::Command::new("reg")
        .args(args)
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .is_ok_and(|o| o.status.success())
}

#[tauri::command]
fn get_autostart() -> bool {
    reg(&["query", RUN_KEY, "/v", RUN_VALUE])
}

/// Starts SideDeck with Windows (current user only, no admin needed).
#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    let ok = if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let command = format!("\"{}\" {AUTOSTART_ARG}", exe.display());
        reg(&["add", RUN_KEY, "/v", RUN_VALUE, "/t", "REG_SZ", "/d", &command, "/f"])
    } else {
        !get_autostart() || reg(&["delete", RUN_KEY, "/v", RUN_VALUE, "/f"])
    };
    ok.then_some(()).ok_or_else(|| {
        i18n::tr(
            "não foi possível alterar a inicialização do Windows",
            "couldn't change the Windows startup setting",
        )
        .into()
    })
}

/// Latest hardware sample, exposed over IPC for any in-app consumer.
#[tauri::command]
fn get_sample(state: tauri::State<Arc<AppState>>) -> String {
    state.get_latest_sample()
}

/// Opens the dashboard in the default browser, optionally showing another
/// model than the one in use. A second WebView window (or an iframe) blanks
/// out rendering on this setup, so the browser is the reliable way to preview
/// the panel on the PC.
#[tauri::command]
fn open_preview(model: Option<String>) -> Result<(), String> {
    let url = match model.as_deref().filter(|m| MODELS.contains(m)) {
        Some(model) => format!("http://localhost:8080/?model={model}"),
        None => "http://localhost:8080/".to_string(),
    };
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// How long "Ver no celular" shows a model before the phone goes back.
const PHONE_PREVIEW: std::time::Duration = std::time::Duration::from_secs(15);

/// Shows `model` on the phone for a few seconds with its saved look, then
/// the panel returns to the model in use by itself (it polls /config.json).
#[tauri::command]
async fn preview_model_on_phone(state: tauri::State<'_, Arc<AppState>>, model: String) -> Result<(), String> {
    if !MODELS.contains(&model.as_str()) {
        return Err(i18n::tr("modelo inválido", "invalid model").into());
    }
    if !state.is_adb_connected() {
        return Err(i18n::tr(
            "o celular não está conectado",
            "the phone isn't connected",
        )
        .into());
    }
    // Wait a little longer than the page's config poll, so the preview lasts
    // the full time on screen.
    state.set_phone_preview(model, PHONE_PREVIEW + std::time::Duration::from_secs(4));
    // The panel may be behind another app when the phone isn't a dedicated screen.
    tauri::async_runtime::spawn_blocking(|| {
        if phone::is_kiosk_installed() {
            phone::open_kiosk();
        }
    });
    Ok(())
}

/// The gallery holds both kinds of background: videos and still images.
const VIDEO_EXTENSIONS: [&str; 7] = ["webm", "mp4", "jpg", "jpeg", "png", "webp", "gif"];
const IMAGE_EXTENSIONS: [&str; 5] = ["jpg", "jpeg", "png", "webp", "gif"];
/// Images are decoded whole on the phone; anything bigger is just wasted memory.
const MAX_IMAGE_BYTES: usize = 15 * 1024 * 1024;
/// Same limit the settings window checks before uploading (with the
/// resolution): bigger files are hard on the phone and on memory, since the
/// upload travels whole through the IPC bridge.
const MAX_VIDEO_BYTES: usize = 80 * 1024 * 1024;

fn is_video_name(name: &str) -> bool {
    name.rsplit_once('.')
        .is_some_and(|(_, ext)| VIDEO_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

/// Reduces an uploaded file name to a safe basename (no path separators or
/// odd characters), keeping the extension.
fn sanitize_video_name(raw: &str) -> Option<String> {
    let base = raw.rsplit(['/', '\\']).next()?.trim();
    let (stem, ext) = base.rsplit_once('.')?;
    let ext = ext.to_ascii_lowercase();
    if !VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }
    let stem: String = stem
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let stem = if stem.trim_matches('_').is_empty() { "video".to_string() } else { stem };
    Some(format!("{stem}.{ext}"))
}

#[tauri::command]
fn list_videos() -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(paths::videos_dir())
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .filter_map(|entry| entry.file_name().into_string().ok())
                .filter(|name| is_video_name(name))
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

/// Saves an uploaded video into the gallery. The file travels as the raw IPC
/// body (much cheaper than a JSON number array for tens of MB) and its name in
/// the `x-file-name` header. Returns the name it was saved under, which gets a
/// numeric suffix if one with the same name already exists.
#[tauri::command]
fn add_video(request: tauri::ipc::Request) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(i18n::tr("corpo da requisição inválido", "invalid request body").into());
    };
    if bytes.len() > MAX_VIDEO_BYTES {
        return Err(i18n::tr("arquivo maior que 80 MB", "file larger than 80 MB").into());
    }
    let raw_name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .ok_or(i18n::tr("nome do arquivo ausente", "missing file name"))?;
    let raw_name = percent_decode(raw_name);
    store_in_gallery(&raw_name, bytes)
}

/// Saves `bytes` in the gallery under a safe version of `raw_name` (a numeric
/// suffix if the name is taken) and returns the name used.
pub(crate) fn store_in_gallery(raw_name: &str, bytes: &[u8]) -> Result<String, String> {
    let name = sanitize_video_name(raw_name).ok_or(i18n::tr(
        "só arquivos .webm, .mp4, .jpg, .png, .webp ou .gif",
        "only .webm, .mp4, .jpg, .png, .webp or .gif files",
    ))?;
    if bytes.len() > MAX_VIDEO_BYTES {
        return Err(i18n::tr("arquivo maior que 80 MB", "file larger than 80 MB").into());
    }
    let is_image = name.rsplit_once('.').is_some_and(|(_, ext)| IMAGE_EXTENSIONS.contains(&ext));
    if is_image && bytes.len() > MAX_IMAGE_BYTES {
        return Err(i18n::tr("imagem maior que 15 MB", "image larger than 15 MB").into());
    }

    let dir = paths::videos_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let (stem, ext) = name.rsplit_once('.').unwrap();
    let mut final_name = name.clone();
    let mut n = 2;
    while dir.join(&final_name).exists() {
        final_name = format!("{stem}-{n}.{ext}");
        n += 1;
    }

    std::fs::write(dir.join(&final_name), bytes).map_err(|e| e.to_string())?;
    Ok(final_name)
}

#[tauri::command]
fn delete_video(name: String) -> Result<(), String> {
    // Only plain names that list_videos would return — never a path.
    if name.contains(['/', '\\']) || name.contains("..") || !is_video_name(&name) {
        return Err(i18n::tr("nome inválido", "invalid name").into());
    }
    std::fs::remove_file(paths::videos_dir().join(name)).map_err(|e| e.to_string())
}

/// Minimal %XX decoder for the file-name header (headers must be ASCII, so the
/// frontend sends it through encodeURIComponent).
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// adb calls take from a few ms to several seconds (an install), so they run
/// off the IPC thread.
#[tauri::command]
async fn get_phone_status() -> Result<phone::PhoneStatus, String> {
    tauri::async_runtime::spawn_blocking(phone::status)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn install_kiosk_app() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(phone::install_kiosk)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn copy_apk_to_phone() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(phone::copy_apk_to_phone)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn reveal_apk() -> Result<(), String> {
    phone::reveal_apk()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    paths::migrate_legacy_data_dir();
    let state = Arc::new(AppState::new());

    tauri::Builder::default()
        // Must come first. A second launch (a shortcut clicked while the app
        // already runs from Windows startup) would fail to bind port 8080 and
        // run a second adb supervisor; instead it just shows this instance.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|arg| arg == AUTOSTART_ARG) {
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_settings,
            get_dashboard_config,
            save_settings,
            reset_settings,
            set_language,
            set_dashboard_mode,
            system_language,
            get_adb_status,
            reconnect_adb,
            get_autostart,
            set_autostart,
            list_videos,
            add_video,
            delete_video,
            get_sample,
            open_preview,
            preview_model_on_phone,
            get_phone_status,
            install_kiosk_app,
            copy_apk_to_phone,
            reveal_apk,
            integrations::get_openrgb_palette
        ])
        .setup(|app| {
            // Paths depend on the resource dir, so everything that serves or
            // runs bundled files starts only after this.
            paths::init(app.path().resource_dir().ok());

            // Started by Windows at logon: stay in the tray. Otherwise show
            // the settings window (it starts hidden so autostart doesn't flash).
            if !std::env::args().any(|arg| arg == AUTOSTART_ARG) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            let state = app.state::<Arc<AppState>>().inner().clone();
            adb_bridge::start_bridge_loop(state.clone());
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");
                rt.block_on(ws_server::run(state));
            });

            let show_item = MenuItem::with_id(app, "show", i18n::tr("Configurações", "Settings"), true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", i18n::tr("Sair", "Quit"), true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            app.manage(TrayItems { show: show_item, quit: quit_item });
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&window_title());
            }

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("SideDeck")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        // Both windows hide instead of closing: the app keeps running in the
        // tray, and the preview window stays around to be shown again.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
