use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Changes every time the host starts. The dashboard reloads itself when it
/// sees a different value, so a phone that kept the page open picks up new
/// HTML/CSS/JS after an update instead of running the old code forever.
/// Every dashboard model, in the order the settings window shows them.
pub const MODELS: [&str; 6] = ["full", "minimal", "amoled", "temps", "glass", "osd"];

pub fn server_build() -> u64 {
    static BUILD: OnceLock<u64> = OnceLock::new();
    *BUILD.get_or_init(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    })
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CardsEnabled {
    pub cpu: bool,
    pub gpu: bool,
    pub ram: bool,
    pub network: bool,
    pub storage: bool,
}

impl Default for CardsEnabled {
    fn default() -> Self {
        Self {
            cpu: true,
            gpu: true,
            ram: true,
            network: true,
            storage: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ScreensaverConfig {
    /// "off" | "cycle" | "always"
    pub mode: String,
    pub interval_ms: u64,
    pub duration_ms: u64,
    pub video: String,
    /// Small CPU/GPU temperature readout drawn over the screensaver video.
    #[serde(default = "default_false")]
    pub show_temps: bool,
    /// "top-left" | "top-right" | "bottom-left" | "bottom-right"
    #[serde(default = "default_temps_corner")]
    pub temps_corner: String,
    /// How much the video is darkened behind the panel in "always" mode
    /// (0 = untouched, 0.9 = almost black).
    #[serde(default = "default_overlay_opacity")]
    pub overlay_opacity: f32,
    /// How the picture or video fills the screen: "auto" (videos fill and
    /// crop, pictures fit whole) | "cover" | "contain" | "fill" (stretch).
    #[serde(default = "default_fit")]
    pub fit: String,
}

fn default_fit() -> String {
    "auto".into()
}

fn default_overlay_opacity() -> f32 {
    0.35
}

fn default_temps_corner() -> String {
    "bottom-right".into()
}

impl Default for ScreensaverConfig {
    fn default() -> Self {
        Self {
            mode: "cycle".into(),
            interval_ms: 5 * 60 * 1000,
            duration_ms: 30 * 1000,
            video: "aurora.webm".into(),
            show_temps: false,
            temps_corner: default_temps_corner(),
            overlay_opacity: default_overlay_opacity(),
            fit: default_fit(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ThemeConfig {
    pub background: String,
    pub card_background: String,
    pub text_color: String,
    pub muted_color: String,
    pub accent_color: String,
    pub accent_color_2: String,
    pub font_scale: f32,
    pub density: f32,
    #[serde(default = "default_brand_text")]
    pub brand_text: String,
    /// Key of one of the fonts in `fonts.css`, or "system".
    #[serde(default = "default_font_family")]
    pub font_family: String,
}

fn default_brand_text() -> String {
    "SideDeck".into()
}
fn default_font_family() -> String {
    "system".into()
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self {
            background: "#0a0a0a".into(),
            card_background: "#111111".into(),
            text_color: "#f5f5f5".into(),
            muted_color: "#8a8a8a".into(),
            accent_color: "#ff7a1a".into(),
            accent_color_2: "#ff7a1a".into(),
            font_scale: 1.0,
            density: 1.0,
            brand_text: default_brand_text(),
            font_family: default_font_family(),
        }
    }
}

/// Layout and formatting options, kept apart from `ThemeConfig` (colors/scale)
/// so the settings UI can group them separately. Every field has a serde
/// default so configs saved by older versions keep loading.
#[derive(Serialize, Deserialize, Clone)]
pub struct DisplayConfig {
    /// "12h" | "24h"
    #[serde(default = "default_clock_format")]
    pub clock_format: String,
    /// "left" | "center" | "right"
    #[serde(default = "default_clock_position")]
    pub clock_position: String,
    #[serde(default = "default_true")]
    pub show_brand: bool,
    #[serde(default = "default_false")]
    pub show_corner_icon: bool,
    #[serde(default = "default_true")]
    pub show_clock: bool,
    /// "mhz" | "ghz"
    #[serde(default = "default_freq_unit")]
    pub freq_unit: String,
    /// "mb" | "gb"
    #[serde(default = "default_mem_unit")]
    pub mem_unit: String,
    #[serde(default = "default_one")]
    pub bar_thickness: f32,
    #[serde(default = "default_one")]
    pub ring_thickness: f32,
    #[serde(default = "default_one")]
    pub icon_scale: f32,
    #[serde(default = "default_corner_radius")]
    pub corner_radius: u32,
    /// FPS counter in the top bar (read from MSI Afterburner / RTSS).
    #[serde(default = "default_false")]
    pub show_fps: bool,
    #[serde(default = "default_one")]
    pub fps_scale: f32,

    // Temperatures model only.
    /// "row" (side by side) | "column" (stacked)
    #[serde(default = "default_temps_layout")]
    pub temps_layout: String,
    /// "left" | "center" | "right"
    #[serde(default = "default_temps_align")]
    pub temps_align: String,
    /// "top" | "center" | "bottom"
    #[serde(default = "default_temps_valign")]
    pub temps_valign: String,
    /// "gpu-top" | "cpu-top": which one comes first (top or left)
    #[serde(default = "default_temps_order")]
    pub temps_order: String,
    /// "together" | "spread" (pushed to opposite edges)
    #[serde(default = "default_temps_spacing")]
    pub temps_spacing: String,
    #[serde(default = "default_one")]
    pub temps_cpu_scale: f32,
    #[serde(default = "default_one")]
    pub temps_gpu_scale: f32,
    #[serde(default = "default_true")]
    pub temps_show_captions: bool,
    #[serde(default = "default_true")]
    pub temps_show_unit: bool,
    /// Multiplier for the gap between the readouts and the screen edges;
    /// 0 puts them right against the corner.
    #[serde(default = "default_one")]
    pub temps_margin: f32,
    /// "numbers" (big digits) | "rings" (gradient ring gauges)
    #[serde(default = "default_temps_style")]
    pub temps_style: String,
    /// Where the CPU/GPU caption goes: "above" | "below" | "side" | "none".
    /// Replaces `temps_show_captions` (migrated in `load`).
    #[serde(default = "default_temps_caption")]
    pub temps_caption: String,

    // Glass model only.
    /// Blur strength multiplier for the frosted cards (0 = clear glass). Any
    /// blur over a video means copying frames to a canvas, which is what makes
    /// weak phones stutter, so clear glass is the default.
    #[serde(default = "default_zero")]
    pub glass_blur: f32,
    /// How milky the cards are, 0 (clear) to 1 (opaque).
    #[serde(default = "default_glass_opacity")]
    pub glass_opacity: f32,
    /// Slowly moving color blobs behind the cards when no video is in the
    /// background.
    #[serde(default = "default_true")]
    pub glass_animated_bg: bool,
    /// Blur the video inside the cards (copies frames to a canvas: heavy).
    /// Off by default so the video stays smooth.
    #[serde(default = "default_false")]
    pub glass_frost: bool,

    // Afterburner (on-screen display) model only.
    /// "afterburner" (mirror what Afterburner shows in its own OSD, falling
    /// back to `osd_lines` when it isn't running) | "custom" (always
    /// `osd_lines`).
    #[serde(default = "default_osd_source")]
    pub osd_source: String,
    /// Lines of the custom layout, in order (see OSD_LINES in main.js).
    #[serde(default = "default_osd_lines")]
    pub osd_lines: Vec<String>,
    /// Text size multiplier on top of the size that fits the lines to the
    /// screen.
    #[serde(default = "default_one")]
    pub osd_scale: f32,
    /// Custom text for the line labels, by key ("cpu", "gpu", "ram", "fps",
    /// "vram", "net", "disk"); empty or missing keeps the default.
    #[serde(default)]
    pub osd_labels: std::collections::HashMap<String, String>,
    /// "left" | "center" | "right"
    #[serde(default = "default_osd_align")]
    pub osd_align: String,
    /// "top" | "center" | "bottom"
    #[serde(default = "default_osd_valign")]
    pub osd_valign: String,

    /// Sensor keys shown, in order. Full model: rows of the CPU and GPU cards
    /// ("temp", "clock", "power", "fan", "vram"). Minimal model: one ring per
    /// key (see MINI_SENSORS in main.js).
    #[serde(default = "default_cpu_stats")]
    pub cpu_stats: Vec<String>,
    #[serde(default = "default_gpu_stats")]
    pub gpu_stats: Vec<String>,
    #[serde(default = "default_mini_sensors")]
    pub mini_sensors: Vec<String>,
}

fn strings(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}
fn default_cpu_stats() -> Vec<String> {
    strings(&["temp", "clock", "power"])
}
fn default_gpu_stats() -> Vec<String> {
    strings(&["temp", "clock", "power"])
}
fn default_osd_source() -> String {
    "afterburner".into()
}
fn default_osd_lines() -> Vec<String> {
    strings(&["cpu", "gpu", "ram", "fps"])
}
fn default_osd_align() -> String {
    "left".into()
}
fn default_osd_valign() -> String {
    "top".into()
}
fn default_mini_sensors() -> Vec<String> {
    strings(&["cpu_load", "ram_load", "gpu_load", "cpu_temp", "gpu_temp", "disk"])
}

fn default_temps_style() -> String {
    "numbers".into()
}
fn default_temps_caption() -> String {
    "above".into()
}
fn default_glass_opacity() -> f32 {
    0.35
}

fn default_temps_align() -> String {
    "left".into()
}
fn default_temps_order() -> String {
    "cpu-top".into()
}
fn default_temps_layout() -> String {
    "row".into()
}
fn default_temps_valign() -> String {
    "bottom".into()
}
fn default_temps_spacing() -> String {
    "together".into()
}

fn default_clock_format() -> String {
    "24h".into()
}
fn default_clock_position() -> String {
    "center".into()
}
fn default_true() -> bool {
    true
}
fn default_false() -> bool {
    false
}
fn default_freq_unit() -> String {
    "mhz".into()
}
fn default_mem_unit() -> String {
    "mb".into()
}
fn default_one() -> f32 {
    1.0
}
fn default_zero() -> f32 {
    0.0
}
fn default_corner_radius() -> u32 {
    12
}

impl Default for DisplayConfig {
    fn default() -> Self {
        Self {
            clock_format: default_clock_format(),
            clock_position: default_clock_position(),
            show_brand: true,
            show_corner_icon: false,
            show_clock: true,
            freq_unit: default_freq_unit(),
            mem_unit: default_mem_unit(),
            bar_thickness: 1.0,
            ring_thickness: 1.0,
            icon_scale: 1.0,
            corner_radius: default_corner_radius(),
            show_fps: false,
            fps_scale: 1.0,
            temps_layout: default_temps_layout(),
            temps_align: default_temps_align(),
            temps_valign: default_temps_valign(),
            temps_order: default_temps_order(),
            temps_spacing: default_temps_spacing(),
            temps_cpu_scale: 1.0,
            temps_gpu_scale: 1.0,
            temps_show_captions: true,
            temps_show_unit: true,
            temps_margin: 1.0,
            temps_style: default_temps_style(),
            temps_caption: default_temps_caption(),
            glass_blur: default_zero(),
            glass_opacity: default_glass_opacity(),
            glass_animated_bg: true,
            glass_frost: false,
            osd_source: default_osd_source(),
            osd_lines: default_osd_lines(),
            osd_scale: 1.0,
            osd_labels: Default::default(),
            osd_align: default_osd_align(),
            osd_valign: default_osd_valign(),
            cpu_stats: default_cpu_stats(),
            gpu_stats: default_gpu_stats(),
            mini_sensors: default_mini_sensors(),
        }
    }
}

/// Look and layout of one dashboard model. Each model keeps its own copy, so
/// switching models also switches colors, scale and layout options.
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct ModelConfig {
    #[serde(default)]
    pub theme: ThemeConfig,
    #[serde(default)]
    pub display: DisplayConfig,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ModelConfigs {
    #[serde(default)]
    pub full: ModelConfig,
    #[serde(default)]
    pub minimal: ModelConfig,
    #[serde(default = "amoled_model")]
    pub amoled: ModelConfig,
    #[serde(default)]
    pub temps: ModelConfig,
    #[serde(default = "glass_model")]
    pub glass: ModelConfig,
    #[serde(default = "osd_model")]
    pub osd: ModelConfig,
}

impl Default for ModelConfigs {
    fn default() -> Self {
        Self {
            full: ModelConfig::default(),
            minimal: ModelConfig::default(),
            amoled: amoled_model(),
            temps: ModelConfig::default(),
            glass: glass_model(),
            osd: osd_model(),
        }
    }
}

/// Frosted glass needs light text and a two-color gradient to look right,
/// so its defaults differ from the other models.
fn glass_model() -> ModelConfig {
    ModelConfig {
        theme: ThemeConfig {
            background: "#07070b".into(),
            card_background: "#111111".into(),
            text_color: "#ffffff".into(),
            muted_color: "#c9c9d6".into(),
            accent_color: "#ff7a1a".into(),
            accent_color_2: "#ff3fa4".into(),
            ..ThemeConfig::default()
        },
        display: DisplayConfig {
            corner_radius: 22,
            ..DisplayConfig::default()
        },
    }
}

/// AMOLED panels switch black pixels off, so the model is pure black with
/// thin, bright accents: no card fills, light type, little lit area.
fn amoled_model() -> ModelConfig {
    ModelConfig {
        theme: ThemeConfig {
            background: "#000000".into(),
            card_background: "#000000".into(),
            text_color: "#f2f2f2".into(),
            muted_color: "#6f6f78".into(),
            accent_color: "#00e0ff".into(),
            accent_color_2: "#8b5cff".into(),
            ..ThemeConfig::default()
        },
        display: DisplayConfig {
            corner_radius: 18,
            ..DisplayConfig::default()
        },
    }
}

/// Text-only overlay like MSI Afterburner's: black background, orange labels.
fn osd_model() -> ModelConfig {
    ModelConfig {
        theme: ThemeConfig {
            background: "#000000".into(),
            card_background: "#000000".into(),
            text_color: "#ffffff".into(),
            muted_color: "#9a9a9a".into(),
            accent_color: "#ff8c1a".into(),
            accent_color_2: "#ff8c1a".into(),
            font_family: "mono".into(),
            ..ThemeConfig::default()
        },
        // No top bar: the lines are the whole screen.
        display: DisplayConfig {
            show_brand: false,
            show_clock: false,
            ..DisplayConfig::default()
        },
    }
}

/// User-chosen display names for the CPU and GPU. Empty means "use the name
/// the hardware reports".
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct DeviceLabels {
    #[serde(default)]
    pub cpu: String,
    #[serde(default)]
    pub gpu: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Settings {
    pub update_interval_ms: u64,
    pub cards: CardsEnabled,
    pub screensaver: ScreensaverConfig,
    #[serde(default)]
    pub models: ModelConfigs,
    #[serde(default)]
    pub labels: DeviceLabels,
    /// One of `MODELS`.
    pub dashboard_mode: String,
    /// Phone mounted as a permanent screen: the host wakes it, keeps the
    /// panel in front and makes it the home app (see adb_bridge).
    #[serde(default = "default_false")]
    pub dedicated_screen: bool,
    /// "auto" (follows Windows) | "pt-BR" | "en"
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_language() -> String {
    "auto".into()
}

impl Settings {
    fn model(&self, name: &str) -> &ModelConfig {
        match name {
            "minimal" => &self.models.minimal,
            "amoled" => &self.models.amoled,
            "temps" => &self.models.temps,
            "glass" => &self.models.glass,
            "osd" => &self.models.osd,
            _ => &self.models.full,
        }
    }

    /// What the dashboard actually consumes: the shared settings plus the
    /// active model's theme/display flattened in, so the frontend never has to
    /// know about per-model storage.
    pub fn resolved(&self) -> serde_json::Value {
        self.resolved_for(None)
    }

    /// Same as `resolved`, but showing `preview` instead of the active model
    /// (the settings window's "see it live" for a model not in use yet).
    pub fn resolved_for(&self, preview: Option<&str>) -> serde_json::Value {
        let mode = preview
            .filter(|name| MODELS.contains(name))
            .unwrap_or(&self.dashboard_mode);
        let model = self.model(mode);
        serde_json::json!({
            "server_build": server_build(),
            "update_interval_ms": self.update_interval_ms,
            "cards": self.cards,
            "screensaver": self.screensaver,
            "dashboard_mode": mode,
            "dedicated_screen": self.dedicated_screen,
            "labels": self.labels,
            "language": crate::i18n::effective(&self.language),
            "theme": model.theme,
            "display": model.display,
        })
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            update_interval_ms: 1000,
            cards: CardsEnabled::default(),
            screensaver: ScreensaverConfig::default(),
            models: ModelConfigs::default(),
            labels: DeviceLabels::default(),
            dashboard_mode: "full".into(),
            dedicated_screen: false,
            language: default_language(),
        }
    }
}

fn settings_path() -> PathBuf {
    crate::paths::data_dir().join("settings.json")
}

pub fn load() -> Settings {
    let path = settings_path();
    let Ok(contents) = std::fs::read_to_string(&path) else {
        return Settings::default();
    };
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return Settings::default();
    };
    migrate_to_per_model(&mut value);
    migrate_display_options(&mut value);
    // The "Gráficos" (aida) model was replaced by AMOLED.
    if value.get("dashboard_mode").and_then(|m| m.as_str()) == Some("aida") {
        value["dashboard_mode"] = "amoled".into();
    }
    serde_json::from_value(value).unwrap_or_default()
}

/// Options renamed or removed over time, fixed up in every saved model:
/// - `temps_show_captions: false` became `temps_caption: "none"`;
/// - the NVIDIA Sans font was dropped (no free license), so it falls back to
///   the system font.
fn migrate_display_options(value: &mut serde_json::Value) {
    let Some(models) = value.get_mut("models").and_then(|m| m.as_object_mut()) else {
        return;
    };
    for model in models.values_mut() {
        if let Some(display) = model.get_mut("display").and_then(|d| d.as_object_mut()) {
            let hid_captions = display.get("temps_show_captions") == Some(&serde_json::Value::Bool(false));
            if hid_captions && !display.contains_key("temps_caption") {
                display.insert("temps_caption".into(), "none".into());
            }
        }
        if let Some(theme) = model.get_mut("theme").and_then(|t| t.as_object_mut()) {
            if theme.get("font_family").and_then(|f| f.as_str()) == Some("nvidia") {
                theme.insert("font_family".into(), "system".into());
            }
        }
    }
}

/// Configs written before per-model settings kept a single `theme`/`display`
/// pair at the top level. Copy it into every model so the user's existing look
/// survives the upgrade instead of silently resetting to defaults.
fn migrate_to_per_model(value: &mut serde_json::Value) {
    let Some(root) = value.as_object_mut() else {
        return;
    };
    if root.contains_key("models") {
        return;
    }

    let mut model = serde_json::Map::new();
    if let Some(theme) = root.remove("theme") {
        model.insert("theme".into(), theme);
    }
    if let Some(display) = root.remove("display") {
        model.insert("display".into(), display);
    }

    let model = serde_json::Value::Object(model);
    let mut models = serde_json::Map::new();
    for key in MODELS {
        models.insert(key.into(), model.clone());
    }
    root.insert("models".into(), serde_json::Value::Object(models));
}

pub fn save(settings: &Settings) -> std::io::Result<()> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(settings).unwrap_or_default();
    std::fs::write(path, json)
}

pub struct AppState {
    pub settings: Mutex<Settings>,
    pub adb_connected: AtomicBool,
    /// Latest hardware sample as JSON, so the in-app preview can read it over
    /// IPC (the Tauri window can't open a plain ws:// socket).
    pub latest_sample: Mutex<String>,
    /// A model shown on the phone for a few seconds ("Ver no celular" on the
    /// Modelos tab) instead of the one in use, and until when.
    phone_preview: Mutex<Option<(String, Instant)>>,
}

impl AppState {
    pub fn new() -> Self {
        let settings = load();
        crate::i18n::set_current(&settings.language);
        Self {
            settings: Mutex::new(settings),
            adb_connected: AtomicBool::new(false),
            latest_sample: Mutex::new(String::new()),
            phone_preview: Mutex::new(None),
        }
    }

    pub fn set_latest_sample(&self, json: String) {
        *self.latest_sample.lock().unwrap() = json;
    }

    pub fn get_latest_sample(&self) -> String {
        self.latest_sample.lock().unwrap().clone()
    }

    pub fn get_settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }

    pub fn set_settings(&self, settings: Settings) -> std::io::Result<()> {
        save(&settings)?;
        crate::i18n::set_current(&settings.language);
        *self.settings.lock().unwrap() = settings;
        Ok(())
    }

    pub fn set_phone_preview(&self, model: String, duration: Duration) {
        *self.phone_preview.lock().unwrap() = Some((model, Instant::now() + duration));
    }

    /// The model the phone should show right now instead of the one in use.
    pub fn phone_preview(&self) -> Option<String> {
        let mut preview = self.phone_preview.lock().unwrap();
        match preview.as_ref() {
            Some((model, until)) if Instant::now() < *until => Some(model.clone()),
            _ => {
                *preview = None;
                None
            }
        }
    }

    pub fn set_adb_connected(&self, connected: bool) {
        self.adb_connected.store(connected, Ordering::Relaxed);
    }

    pub fn is_adb_connected(&self) -> bool {
        self.adb_connected.load(Ordering::Relaxed)
    }
}
