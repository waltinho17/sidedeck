import { t, setLanguage, translatePage, getLanguage } from "./i18n.js";

const { invoke } = window.__TAURI__.core;

const ADB_POLL_INTERVAL_MS = 3000;
const PHONE_POLL_INTERVAL_MS = 4000;

// Ready-made palettes. `name` is [pt, en]; the dots show background, card,
// accent and second accent.
const COLOR_PRESETS = [
  { id: "orange", name: ["Laranja", "Orange"], background: "#0a0a0a", card_background: "#111111", text_color: "#f5f5f5", muted_color: "#8a8a8a", accent_color: "#ff7a1a", accent_color_2: "#ff7a1a" },
  { id: "pink", name: ["Pink / Ciano", "Pink / Cyan"], background: "#0d0d10", card_background: "#16161a", text_color: "#f0f0f5", muted_color: "#9090a0", accent_color: "#ff2d78", accent_color_2: "#00e0ff" },
  { id: "red", name: ["Raiden Red", "Raiden Red"], background: "#000000", card_background: "#0f0f0f", text_color: "#eaeaea", muted_color: "#7a7a7a", accent_color: "#e6231e", accent_color_2: "#e6231e" },
  { id: "purple", name: ["Roxo / Rosa", "Purple / Pink"], background: "#0a0710", card_background: "#151020", text_color: "#f2eefc", muted_color: "#9086ad", accent_color: "#8b2fd9", accent_color_2: "#ff3fa4" },
  { id: "green", name: ["Verde Neon", "Neon Green"], background: "#060a07", card_background: "#0d1410", text_color: "#eaf5ec", muted_color: "#7d9184", accent_color: "#2fe06a", accent_color_2: "#9fff5e" },
  { id: "blue", name: ["Azul Elétrico", "Electric Blue"], background: "#06080f", card_background: "#0e1220", text_color: "#e9eeff", muted_color: "#7f89a8", accent_color: "#2f7dff", accent_color_2: "#00d4ff" },
  { id: "teal", name: ["Turquesa", "Turquoise"], background: "#040d0e", card_background: "#0c1a1c", text_color: "#e6f7f8", muted_color: "#789396", accent_color: "#14d1c4", accent_color_2: "#4affd0" },
  { id: "amber", name: ["Âmbar", "Amber"], background: "#0c0904", card_background: "#17120a", text_color: "#f8f0e2", muted_color: "#9c8d74", accent_color: "#ffb020", accent_color_2: "#ff7a1a" },
  { id: "ice", name: ["Gelo", "Ice"], background: "#080b10", card_background: "#121722", text_color: "#f2f6ff", muted_color: "#8794ab", accent_color: "#7fc8ff", accent_color_2: "#c9e8ff" },
  { id: "mono", name: ["Monocromático", "Monochrome"], background: "#0a0a0a", card_background: "#151515", text_color: "#f5f5f5", muted_color: "#8a8a8a", accent_color: "#e4e4e4", accent_color_2: "#9a9a9a" },

  { id: "cyberpunk", name: ["Cyberpunk", "Cyberpunk"], background: "#0b0b14", card_background: "#14141f", text_color: "#fffbe6", muted_color: "#8a86a8", accent_color: "#fcee0a", accent_color_2: "#00f0ff" },
  { id: "synthwave", name: ["Synthwave", "Synthwave"], background: "#120a24", card_background: "#1d1238", text_color: "#f6e8ff", muted_color: "#9b86c4", accent_color: "#ff2a6d", accent_color_2: "#05d9e8" },
  { id: "matrix", name: ["Matrix", "Matrix"], background: "#000a00", card_background: "#041204", text_color: "#c8ffd0", muted_color: "#4f8f5a", accent_color: "#00ff41", accent_color_2: "#008f11" },
  { id: "sunset", name: ["Pôr do sol", "Sunset"], background: "#12080c", card_background: "#1e0f14", text_color: "#ffeee6", muted_color: "#b08a85", accent_color: "#ff5e3a", accent_color_2: "#ffb347" },
  { id: "ocean", name: ["Oceano", "Ocean"], background: "#03111a", card_background: "#082030", text_color: "#e4f4ff", muted_color: "#6f94ab", accent_color: "#00b4d8", accent_color_2: "#90e0ef" },
  { id: "aurora", name: ["Aurora boreal", "Northern lights"], background: "#050b14", card_background: "#0b1622", text_color: "#e8fff8", muted_color: "#6f9a94", accent_color: "#3dffb0", accent_color_2: "#6a5cff" },
  { id: "bloodmoon", name: ["Lua de sangue", "Blood moon"], background: "#080000", card_background: "#140505", text_color: "#ffe9e9", muted_color: "#a07070", accent_color: "#ff1f3d", accent_color_2: "#ff6a00" },
  { id: "gold", name: ["Ouro", "Gold"], background: "#050505", card_background: "#0f0d08", text_color: "#f7efd8", muted_color: "#9a8f70", accent_color: "#d4af37", accent_color_2: "#f6e27a" },
  { id: "candy", name: ["Algodão-doce", "Cotton candy"], background: "#0e0a14", card_background: "#181124", text_color: "#fdf0ff", muted_color: "#a898b8", accent_color: "#ff77e1", accent_color_2: "#77e1ff" },

  { id: "dracula", name: ["Dracula", "Dracula"], background: "#1e1f29", card_background: "#282a36", text_color: "#f8f8f2", muted_color: "#8b93bd", accent_color: "#bd93f9", accent_color_2: "#ff79c6" },
  { id: "nord", name: ["Nord", "Nord"], background: "#242933", card_background: "#2e3440", text_color: "#eceff4", muted_color: "#8c9bb5", accent_color: "#88c0d0", accent_color_2: "#b48ead" },
  { id: "tokyo", name: ["Tokyo Night", "Tokyo Night"], background: "#16161e", card_background: "#1a1b26", text_color: "#c0caf5", muted_color: "#7a84b8", accent_color: "#7aa2f7", accent_color_2: "#bb9af7" },
  { id: "catppuccin", name: ["Catppuccin", "Catppuccin"], background: "#11111b", card_background: "#1e1e2e", text_color: "#cdd6f4", muted_color: "#9399b2", accent_color: "#cba6f7", accent_color_2: "#89b4fa" },
  { id: "rosepine", name: ["Rosé Pine", "Rosé Pine"], background: "#191724", card_background: "#1f1d2e", text_color: "#e0def4", muted_color: "#908caa", accent_color: "#ebbcba", accent_color_2: "#c4a7e7" },
  { id: "gruvbox", name: ["Gruvbox", "Gruvbox"], background: "#1d2021", card_background: "#282828", text_color: "#ebdbb2", muted_color: "#a89984", accent_color: "#fabd2f", accent_color_2: "#fe8019" },
  { id: "monokai", name: ["Monokai", "Monokai"], background: "#1e1f1c", card_background: "#272822", text_color: "#f8f8f2", muted_color: "#a59f85", accent_color: "#a6e22e", accent_color_2: "#f92672" },
  { id: "solarized", name: ["Solarized", "Solarized"], background: "#002b36", card_background: "#073642", text_color: "#eee8d5", muted_color: "#93a1a1", accent_color: "#b58900", accent_color_2: "#2aa198" },

  { id: "teamgreen", name: ["Verde NVIDIA", "NVIDIA green"], background: "#0a0a0a", card_background: "#141414", text_color: "#f2f2f2", muted_color: "#8a8a8a", accent_color: "#76b900", accent_color_2: "#a6e22e" },
  { id: "teamred", name: ["Vermelho AMD", "AMD red"], background: "#0a0a0a", card_background: "#141414", text_color: "#f2f2f2", muted_color: "#8a8a8a", accent_color: "#ed1c24", accent_color_2: "#ff6b00" },
  { id: "teamblue", name: ["Azul Intel", "Intel blue"], background: "#06090f", card_background: "#0f141c", text_color: "#eef4fb", muted_color: "#8190a5", accent_color: "#0071c5", accent_color_2: "#00c7fd" },
];

// Screensaver timing choices, in seconds.
const INTERVAL_OPTIONS = [60, 120, 180, 300, 600, 900, 1800];
const DURATION_OPTIONS = [10, 20, 30, 60, 120, 300];

function durationLabel(seconds) {
  if (seconds < 60) return t("time.secs", { n: seconds });
  if (seconds === 60) return t("time.min1");
  return t("time.mins", { n: seconds / 60 });
}

const MODELS = ["full", "minimal", "amoled", "temps", "glass", "osd"];

let currentSettings = null;
/** Which model's theme/display the Layout and Aparência tabs are editing. */
let activeModel = "full";
/** The model shown large on the Modelos tab (not necessarily in use). */
let previewModel = "full";

function el(id) {
  return document.getElementById(id);
}

/* ---------- Segmented controls ---------- */

function setSegmented(id, value) {
  const container = el(id);
  if (!container) return;
  container.querySelectorAll(".seg-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === String(value));
  });
}

function getSegmented(id, fallback) {
  const container = el(id);
  const active = container?.querySelector(".seg-option.active");
  return active ? active.dataset.value : fallback;
}

function initSegmentedControls() {
  document.querySelectorAll(".segmented").forEach((container) => {
    container.querySelectorAll(".seg-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        setSegmented(container.id, btn.dataset.value);
        markDirty();

        if (container.id === "seg-screensaver-mode") {
          updateCycleTimingVisibility();
        }
      });
    });
  });
}

/** Each model keeps its own theme/display, so switching models stashes the
 *  values currently in the form and loads the other model's. */
function switchModel(model) {
  if (currentSettings) {
    currentSettings.models[activeModel] = readModelFromForm();
  }
  activeModel = model;
  applyModelToForm(currentSettings.models[activeModel]);
  updateModelBadges();
}

function updateModelBadges() {
  document.querySelectorAll(".model-badge").forEach((badge) => {
    badge.textContent = t(`model.${activeModel}`);
  });
  renderModelStage();
  // Controls tagged with data-models only affect those models; hide them
  // while another model is being edited.
  document.querySelectorAll("[data-models]").forEach((node) => {
    node.hidden = !node.dataset.models.split(" ").includes(activeModel);
  });
}

function updateCycleTimingVisibility() {
  const mode = getSegmented("seg-screensaver-mode", "cycle");
  el("cycle-timing-block").style.display = mode === "cycle" ? "" : "none";
  el("ss-temps-block").style.display = mode === "cycle" ? "" : "none";
  el("overlay-block").style.display = mode === "always" ? "" : "none";
}

/* ---------- Models tab ---------- */

/** Big preview of `previewModel`, with the actions for it. */
function renderModelStage() {
  const inUse = previewModel === activeModel;
  el("model-stage-img").src = `assets/previews/${previewModel}.png`;
  el("model-stage-name").textContent = t(`model.${previewModel}`);
  el("model-stage-desc").textContent = t(`model.${previewModel}.desc`);
  el("model-in-use").hidden = !inUse;
  el("model-use-btn").hidden = inUse;
  document.querySelectorAll(".model-card").forEach((card) => {
    card.classList.toggle("previewing", card.dataset.model === previewModel);
    card.classList.toggle("in-use", card.dataset.model === activeModel);
    const used = card.dataset.model === activeModel;
    const state = card.querySelector(".model-card-state");
    if (state) {
      state.hidden = !used;
      state.textContent = t("models.applyShort");
      const apply = card.querySelector(".model-card-btn.primary");
      apply.hidden = used;
      apply.textContent = t("models.apply");
      card.querySelector(".model-card-btn.ghost-btn").textContent = t("models.browserShort");
    }
  });
}

/** Switches the phone to `model` right away (no "Salvar alterações" needed);
 *  anything else still being edited stays pending in the form. */
async function useModel(model) {
  previewModel = model;
  if (model === activeModel) {
    renderModelStage();
    return;
  }
  try {
    await invoke("set_dashboard_mode", { model });
  } catch (err) {
    setModelStatus(t("models.useFailed", { error: err }), true);
    return;
  }
  switchModel(model);
  if (currentSettings) currentSettings.dashboard_mode = model;
  setModelStatus(t("models.applied", { model: t(`model.${model}`) }));
}

function setModelStatus(text, isError = false) {
  const status = el("model-stage-status");
  status.textContent = text;
  status.style.color = isError ? "var(--err)" : "";
}

function initModelGallery() {
  document.querySelectorAll(".model-card").forEach((card) => {
    // Per-card actions, so a model can be applied or opened without going
    // down to the big preview.
    const name = card.querySelector(".model-card-name");
    const bar = document.createElement("div");
    bar.className = "model-card-bar";
    const state = document.createElement("span");
    state.className = "model-card-state";
    state.textContent = t("models.applyShort");
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "primary model-card-btn";
    apply.textContent = t("models.apply");
    apply.addEventListener("click", (event) => {
      event.stopPropagation();
      useModel(card.dataset.model);
    });
    const browser = document.createElement("button");
    browser.type = "button";
    browser.className = "ghost-btn model-card-btn";
    browser.textContent = t("models.browserShort");
    browser.title = t("models.browserTip");
    browser.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        await invoke("open_preview", { model: card.dataset.model });
      } catch (err) {
        console.error("Failed to open preview", err);
      }
    });
    bar.append(name, state, apply, browser);
    card.appendChild(bar);
    card.addEventListener("click", () => {
      previewModel = card.dataset.model;
      setModelStatus("");
      renderModelStage();
    });
    card.addEventListener("dblclick", () => useModel(card.dataset.model));
  });
  el("model-use-btn").addEventListener("click", () => useModel(previewModel));
  el("model-phone-btn").addEventListener("click", async () => {
    const btn = el("model-phone-btn");
    btn.disabled = true;
    try {
      await invoke("preview_model_on_phone", { model: previewModel });
      setModelStatus(t("models.tryPhoneOn", { model: t(`model.${previewModel}`) }));
    } catch (err) {
      setModelStatus(t("models.tryPhoneFailed", { error: err }), true);
    } finally {
      setTimeout(() => (btn.disabled = false), 2000);
    }
  });
  el("model-live-btn").addEventListener("click", async () => {
    try {
      await invoke("open_preview", { model: previewModel });
    } catch (err) {
      console.error("Failed to open preview", err);
    }
  });
}

/* ---------- Tabs ---------- */

function initTabs() {
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      navItems.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.hidden = panel.dataset.panel !== btn.dataset.tab;
      });
      el("content-scroll")?.scrollTo(0, 0);
    });
  });
}

/* ---------- Sliders ---------- */

function bindSlider(id, formatter) {
  const slider = el(id);
  const output = el(`${id}-value`);
  const update = () => {
    output.textContent = formatter(Number(slider.value));
  };
  slider.addEventListener("input", () => {
    update();
    markDirty();
  });
  return update;
}

const percent = (v) => `${Math.round(v * 100)}%`;

let sliderUpdaters = [];

function initSliders() {
  sliderUpdaters = [
    bindSlider("font-scale", percent),
    bindSlider("density", percent),
    bindSlider("bar-thickness", percent),
    bindSlider("ring-thickness", percent),
    bindSlider("icon-scale", percent),
    bindSlider("fps-scale", percent),
    bindSlider("temps-cpu-scale", percent),
    bindSlider("temps-gpu-scale", percent),
    bindSlider("temps-margin", percent),
    bindSlider("video-overlay", percent),
    bindSlider("glass-blur", percent),
    bindSlider("osd-scale", percent),
    bindSlider("glass-opacity", percent),
    bindSlider("update-interval", (v) => `${v} ms`),
  ];
}

function refreshSliderLabels() {
  sliderUpdaters.forEach((fn) => fn());
}

/* ---------- Selects ---------- */

/** (Re)builds the options in the current language, keeping the selection. */
function fillSelect(id, seconds) {
  const select = el(id);
  const selected = select.value;
  select.innerHTML = "";
  for (const value of seconds) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = durationLabel(value);
    select.appendChild(option);
  }
  if (selected) select.value = selected;
}

/** Selects the closest available option so custom values from an older
 *  config (or hand-edited JSON) still land on something sensible. */
function selectClosest(id, seconds, options) {
  const closest = options.reduce((best, value) =>
    Math.abs(value - seconds) < Math.abs(best - seconds) ? value : best
  );
  el(id).value = String(closest);
}

/* ---------- Sensor lists ---------- */

// Keys of each list; their names come from i18n.js ("sensor.*" / "stat.*").
const MINI_SENSOR_OPTIONS = [
  "cpu_load", "cpu_temp", "cpu_clock", "cpu_power",
  "gpu_load", "gpu_temp", "gpu_clock", "gpu_power", "gpu_fan", "vram",
  "ram_load", "disk", "net_down", "net_up", "fps",
];
const CPU_STAT_OPTIONS = ["temp", "clock", "power"];
const GPU_STAT_OPTIONS = ["temp", "clock", "power", "fan", "vram"];
// Lines of the Afterburner model's own layout (OSD_LINES in main.js).
const OSD_LINE_OPTIONS = ["cpu", "gpu", "vram", "ram", "fps", "net", "disk"];
const SENSOR_LISTS = {
  "osd-line-list": { keys: OSD_LINE_OPTIONS, prefix: "osdline" },
  "cpu-stat-list": { keys: CPU_STAT_OPTIONS, prefix: "stat" },
  "gpu-stat-list": { keys: GPU_STAT_OPTIONS, prefix: "stat" },
};
// The full model's cards only fit 4 rows next to the ring (MAX_CARD_STATS in
// main.js).
const SENSOR_LIMITS = {
  "cpu-stat-list": 4,
  "gpu-stat-list": 4,
};

/** Ordered checklist: the chosen sensors first, in their order, then the
 *  rest. The arrows move a row; unchecked rows just sit at the end. */
function renderSensorList(id, selected) {
  const { keys, prefix } = SENSOR_LISTS[id];
  const label = (key) => t(`${prefix}.${key}`);
  const limit = SENSOR_LIMITS[id] || Infinity;
  const chosen = (selected || []).filter((key) => keys.includes(key)).slice(0, limit);
  const full = chosen.length >= limit;
  const order = [...chosen, ...keys.filter((key) => !chosen.includes(key))];

  const container = el(id);
  container.innerHTML = "";
  order.forEach((key, index) => {
    const on = chosen.includes(key);
    const locked = !on && full;
    const row = document.createElement("div");
    row.className = "sensor-row" + (on ? "" : " off");
    row.dataset.key = key;
    row.title = locked ? t("sensors.max", { limit }) : "";
    row.innerHTML = `
      <label><input type="checkbox" ${on ? "checked" : ""} ${locked ? "disabled" : ""} /><span>${label(key)}</span></label>
      <button type="button" class="order" data-move="-1" title="${t("sensors.up")}" ${index === 0 ? "disabled" : ""}>▲</button>
      <button type="button" class="order" data-move="1" title="${t("sensors.down")}" ${index === order.length - 1 ? "disabled" : ""}>▼</button>
    `;
    row.querySelector("input").addEventListener("change", () => {
      renderSensorList(id, readSensorList(id));
      markDirty();
    });
    row.querySelectorAll(".order").forEach((btn) => {
      btn.addEventListener("click", () => {
        const keys = [...container.children].map((r) => r.dataset.key);
        const from = keys.indexOf(key);
        const to = from + Number(btn.dataset.move);
        [keys[from], keys[to]] = [keys[to], keys[from]];
        const checked = new Set(readSensorList(id));
        renderSensorList(id, keys.filter((k) => checked.has(k)));
        markDirty();
      });
    });
    container.appendChild(row);
  });
}

function readSensorList(id) {
  return [...el(id).children]
    .filter((row) => row.querySelector("input").checked)
    .map((row) => row.dataset.key);
}

/* ---------- Minimal model: the rings as a grid, like on the phone ---------- */

// What each ring shows on the phone (caption) and an example reading, so the
// editor looks like the panel. Captions match MINI_SENSORS in main.js.
const MINI_PREVIEW = {
  cpu_load: ["CPU", "33%", 0.33],
  cpu_temp: ["CPU TEMP", "63°C", 0.63],
  cpu_clock: ["CPU MHZ", "4388", 0.8],
  cpu_power: ["CPU POWER", "78W", 0.5],
  gpu_load: ["GPU", "89%", 0.89],
  gpu_temp: ["GPU TEMP", "70°C", 0.7],
  gpu_clock: ["GPU MHZ", "1880", 0.62],
  gpu_power: ["GPU POWER", "218W", 0.9],
  gpu_fan: ["GPU FAN", "58%", 0.58],
  vram: ["VRAM", "78%", 0.78],
  ram_load: ["RAM", "50%", 0.5],
  disk: ["DISK", "64%", 0.64],
  net_down: ["DOWN MB/S", "1,4", 0.4],
  net_up: ["UP KB/S", "82", 0.25],
  fps: ["FPS", "144", 0.9],
};
const MINI_ARC = "M22 138 A 68 68 0 1 1 138 138";
// Width/height of the phone's ring area (1480x720 minus the top bar).
const PANEL_ASPECT = 2.25;

/** The rings shown by the minimal model, in order. */
let miniSensors = [];

/** Same column choice as layoutMiniGrid in main.js. */
function miniColumns(count) {
  const ringAspect = 160 / 130;
  let best = { cols: 1, size: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const size = Math.min(PANEL_ASPECT / cols, (1 / rows) * ringAspect);
    if (size > best.size) best = { cols, size };
  }
  return best.cols;
}

function miniTile(key) {
  const [caption, value, ratio] = MINI_PREVIEW[key];
  const tile = document.createElement("div");
  tile.className = "mini-tile";
  tile.dataset.key = key;
  tile.title = t(`sensor.${key}`);
  tile.innerHTML = `
    <svg viewBox="0 20 160 130">
      <path class="mini-tile-track" d="${MINI_ARC}" pathLength="100" />
      <path class="mini-tile-fill" d="${MINI_ARC}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - ratio * 100}" />
      <text class="mini-tile-value" x="80" y="97">${value}</text>
      <text class="mini-tile-caption" x="80" y="129">${caption}</text>
    </svg>
    <button type="button" class="mini-tile-remove" title="${t("sensors.remove")}">×</button>`;
  tile.querySelector(".mini-tile-remove").addEventListener("click", (event) => {
    event.stopPropagation();
    miniSensors = miniSensors.filter((k) => k !== key);
    renderMiniEditor();
    markDirty();
  });
  tile.addEventListener("pointerdown", (event) => startMiniDrag(event, tile));
  return tile;
}

function renderMiniEditor() {
  const editor = el("mini-editor");
  editor.innerHTML = "";
  editor.style.setProperty("--cols", miniColumns(Math.max(1, miniSensors.length)));
  editor.style.setProperty("--rows", Math.ceil(miniSensors.length / miniColumns(Math.max(1, miniSensors.length))) || 1);
  if (miniSensors.length === 0) {
    editor.innerHTML = `<span class="hint">${t("sensors.empty")}</span>`;
  }
  miniSensors.forEach((key) => editor.appendChild(miniTile(key)));

  const chips = el("mini-chips");
  chips.innerHTML = "";
  MINI_SENSOR_OPTIONS.filter((key) => !miniSensors.includes(key)).forEach((key) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "mini-chip";
    chip.textContent = `+ ${t(`sensor.${key}`)}`;
    chip.addEventListener("click", () => {
      miniSensors = [...miniSensors, key];
      renderMiniEditor();
      markDirty();
    });
    chips.appendChild(chip);
  });
}

/** Pointer-based reordering (HTML5 drag and drop doesn't reach the page in
 *  Tauri windows on Windows): the tile follows the pointer and takes the
 *  place of the tile it passes over. */
function startMiniDrag(event, tile) {
  if (event.button !== 0 || event.target.closest(".mini-tile-remove")) return;
  const editor = el("mini-editor");
  const rect = tile.getBoundingClientRect();
  const grabX = event.clientX - rect.left;
  const grabY = event.clientY - rect.top;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;

  // Offset from wherever the tile currently sits in the grid.
  const follow = (e) => {
    tile.style.transform = "";
    const home = tile.getBoundingClientRect();
    tile.style.transform = `translate(${e.clientX - grabX - home.left}px, ${e.clientY - grabY - home.top}px)`;
  };
  const onMove = (e) => {
    if (!dragging) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
      dragging = true;
      tile.classList.add("dragging");
    }
    tile.style.pointerEvents = "none";
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(".mini-tile");
    tile.style.pointerEvents = "";
    if (over && over !== tile && editor.contains(over)) {
      const tiles = [...editor.querySelectorAll(".mini-tile")];
      const movingBack = tiles.indexOf(over) < tiles.indexOf(tile);
      editor.insertBefore(tile, movingBack ? over : over.nextSibling);
    }
    follow(e);
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    tile.classList.remove("dragging");
    tile.style.transform = "";
    if (!dragging) return;
    const order = [...editor.querySelectorAll(".mini-tile")].map((node) => node.dataset.key);
    if (order.join() !== miniSensors.join()) {
      miniSensors = order;
      markDirty();
    }
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

/* ---------- Presets ---------- */

function applyPreset(preset) {
  el("color-bg").value = preset.background;
  el("color-card").value = preset.card_background;
  el("color-text").value = preset.text_color;
  el("color-muted").value = preset.muted_color;
  el("color-accent").value = preset.accent_color;
  el("color-accent-2").value = preset.accent_color_2;
  markDirty();
}

/** Builds the palette buttons in the current language. */
function renderPresets() {
  const row = el("preset-row");
  row.innerHTML = "";
  const index = getLanguage() === "en" ? 1 : 0;
  for (const preset of COLOR_PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn";
    btn.dataset.preset = preset.id;
    const dots = document.createElement("span");
    dots.className = "preset-dots";
    for (const color of [preset.background, preset.card_background, preset.accent_color, preset.accent_color_2]) {
      const dot = document.createElement("i");
      dot.style.background = color;
      dots.appendChild(dot);
    }
    const label = document.createElement("span");
    label.textContent = preset.name[index];
    btn.append(dots, label);
    btn.addEventListener("click", () => applyPreset(preset));
    row.appendChild(btn);
  }
}

function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return [(h + 360) % 360, max ? delta / max : 0, max];
}

function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

/** Reads the colors lit on the PC's RGB devices through OpenRGB's SDK server
 *  and builds a dark palette around them. */
async function importOpenRgb() {
  const btn = el("openrgb-btn");
  const status = el("openrgb-status");
  btn.disabled = true;
  status.style.color = "";
  status.textContent = t("openrgb.reading");
  try {
    const rgb = await invoke("get_openrgb_palette");
    const [hue, sat] = hexToHsv(rgb.accent);
    applyPreset({
      background: hsvToHex(hue, Math.min(sat, 0.6), 0.04),
      card_background: hsvToHex(hue, Math.min(sat, 0.5), 0.09),
      text_color: "#f2f2f2",
      muted_color: hsvToHex(hue, 0.12, 0.62),
      accent_color: rgb.accent,
      accent_color_2: rgb.accent_2,
    });
    status.textContent = t("openrgb.done", { n: rgb.devices });
  } catch (err) {
    status.style.color = "var(--err)";
    status.textContent = String(err);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Version + update check ---------- */

const RELEASES_API = "https://api.github.com/repos/waltinho17/sidedeck/releases/latest";

/** "v1.4.0" -> [1, 4, 0] */
function parseVersion(text) {
  return String(text).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
}

function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

let appVersion = "";
let releaseUrl = "";

async function checkForUpdate(manual = false) {
  const label = el("app-version");
  const button = el("update-btn");
  try {
    const response = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(String(response.status));
    const release = await response.json();
    const latest = String(release.tag_name || "");
    if (latest && isNewer(latest, appVersion)) {
      releaseUrl = release.html_url;
      button.textContent = t("update.available", { version: latest.replace(/^v/i, "") });
      button.hidden = false;
    } else if (manual) {
      label.title = t("update.latest");
      el("save-feedback").textContent = t("update.latest");
    }
  } catch (err) {
    // Offline, no release published yet or rate limited: stay quiet unless asked.
    if (manual) el("save-feedback").textContent = t("update.failed");
  }
}

async function initVersion() {
  try {
    appVersion = await window.__TAURI__.app.getVersion();
  } catch (err) {
    return;
  }
  const label = el("app-version");
  label.textContent = `SideDeck v${appVersion}`;
  label.title = t("update.check");
  label.style.cursor = "pointer";
  label.addEventListener("click", () => checkForUpdate(true));
  el("update-btn").addEventListener("click", () => {
    if (releaseUrl) invoke("plugin:opener|open_url", { url: releaseUrl });
  });
  checkForUpdate();
}

function initPresets() {
  renderPresets();
  el("openrgb-btn").addEventListener("click", importOpenRgb);
}

/* ---------- Dirty state ---------- */

function markDirty() {
  const feedback = el("save-feedback");
  feedback.className = "pending";
  feedback.textContent = t("save.pending");
}

function clearDirty(message = "") {
  const feedback = el("save-feedback");
  feedback.className = "";
  feedback.textContent = message;
}

/* ---------- Form <-> settings ---------- */

/** Theme + display of one model into the Layout and Aparência tabs. */
function applyModelToForm(model) {
  const theme = model.theme;
  const display = model.display;

  // Layout
  el("brand-text-input").value = theme.brand_text ?? "SideDeck";
  el("show-brand").checked = display.show_brand !== false;
  el("show-corner-icon").checked = display.show_corner_icon === true;
  el("show-fps").checked = display.show_fps === true;
  el("show-clock").checked = display.show_clock !== false;
  el("fps-scale").value = display.fps_scale ?? 1;
  setSegmented("seg-temps-layout", display.temps_layout || "row");
  setSegmented("seg-temps-align", display.temps_align || "left");
  setSegmented("seg-temps-valign", display.temps_valign || "bottom");
  setSegmented("seg-temps-order", display.temps_order || "cpu-top");
  setSegmented("seg-temps-spacing", display.temps_spacing || "together");
  setSegmented("seg-temps-style", display.temps_style || "numbers");
  setSegmented("seg-temps-caption", display.temps_caption || (display.temps_show_captions === false ? "none" : "above"));
  el("glass-blur").value = display.glass_blur ?? 0;
  el("glass-opacity").value = display.glass_opacity ?? 0.35;
  el("glass-frost").checked = display.glass_frost === true;
  el("glass-animated-bg").checked = display.glass_animated_bg !== false;
  el("temps-cpu-scale").value = display.temps_cpu_scale ?? 1;
  el("temps-gpu-scale").value = display.temps_gpu_scale ?? 1;
  el("temps-margin").value = display.temps_margin ?? 1;
  miniSensors = (display.mini_sensors || []).filter((key) => MINI_PREVIEW[key]);
  renderMiniEditor();
  renderSensorList("cpu-stat-list", display.cpu_stats);
  renderSensorList("gpu-stat-list", display.gpu_stats);
  renderSensorList("osd-line-list", display.osd_lines || ["cpu", "gpu", "ram", "fps"]);
  setSegmented("seg-osd-source", display.osd_source || "afterburner");
  setSegmented("seg-osd-align", display.osd_align || "left");
  setSegmented("seg-osd-valign", display.osd_valign || "top");
  el("osd-scale").value = display.osd_scale ?? 1;
  document.querySelectorAll(".osd-label-input").forEach((input) => {
    input.value = (display.osd_labels || {})[input.dataset.key] || "";
  });
  el("temps-show-unit").checked = display.temps_show_unit !== false;
  setSegmented("seg-clock-format", display.clock_format);
  setSegmented("seg-clock-position", display.clock_position);
  setSegmented("seg-freq-unit", display.freq_unit);
  setSegmented("seg-mem-unit", display.mem_unit);
  setSegmented("seg-corner-radius", display.corner_radius);
  el("bar-thickness").value = display.bar_thickness;
  el("ring-thickness").value = display.ring_thickness;
  el("icon-scale").value = display.icon_scale;

  // Aparência
  el("color-bg").value = theme.background;
  el("color-card").value = theme.card_background;
  el("color-text").value = theme.text_color;
  el("color-muted").value = theme.muted_color;
  el("color-accent").value = theme.accent_color;
  el("color-accent-2").value = theme.accent_color_2;
  el("font-scale").value = theme.font_scale;
  el("density").value = theme.density;
  setSegmented("seg-font-family", theme.font_family || "system");

  refreshSliderLabels();
}

function readModelFromForm() {
  return {
    theme: {
      brand_text: el("brand-text-input").value,
      background: el("color-bg").value,
      card_background: el("color-card").value,
      text_color: el("color-text").value,
      muted_color: el("color-muted").value,
      accent_color: el("color-accent").value,
      accent_color_2: el("color-accent-2").value,
      font_scale: Number(el("font-scale").value) || 1,
      density: Number(el("density").value) || 1,
      font_family: getSegmented("seg-font-family", "system"),
    },
    display: {
      clock_format: getSegmented("seg-clock-format", "24h"),
      clock_position: getSegmented("seg-clock-position", "center"),
      show_brand: el("show-brand").checked,
      show_corner_icon: el("show-corner-icon").checked,
      show_fps: el("show-fps").checked,
      show_clock: el("show-clock").checked,
      fps_scale: Number(el("fps-scale").value) || 1,
      temps_layout: getSegmented("seg-temps-layout", "row"),
      temps_align: getSegmented("seg-temps-align", "left"),
      temps_valign: getSegmented("seg-temps-valign", "bottom"),
      temps_order: getSegmented("seg-temps-order", "cpu-top"),
      temps_spacing: getSegmented("seg-temps-spacing", "together"),
      temps_cpu_scale: Number(el("temps-cpu-scale").value) || 1,
      temps_gpu_scale: Number(el("temps-gpu-scale").value) || 1,
      temps_margin: Number(el("temps-margin").value),
      mini_sensors: [...miniSensors],
      cpu_stats: readSensorList("cpu-stat-list"),
      gpu_stats: readSensorList("gpu-stat-list"),
      osd_lines: readSensorList("osd-line-list"),
      osd_source: getSegmented("seg-osd-source", "afterburner"),
      osd_align: getSegmented("seg-osd-align", "left"),
      osd_valign: getSegmented("seg-osd-valign", "top"),
      osd_scale: Number(el("osd-scale").value) || 1,
      osd_labels: Object.fromEntries(
        [...document.querySelectorAll(".osd-label-input")]
          .map((input) => [input.dataset.key, input.value.trim()])
          .filter(([, value]) => value)
      ),
      temps_style: getSegmented("seg-temps-style", "numbers"),
      temps_caption: getSegmented("seg-temps-caption", "above"),
      temps_show_captions: getSegmented("seg-temps-caption", "above") !== "none",
      glass_blur: Number(el("glass-blur").value),
      glass_opacity: Number(el("glass-opacity").value),
      glass_frost: el("glass-frost").checked,
      glass_animated_bg: el("glass-animated-bg").checked,
      temps_show_unit: el("temps-show-unit").checked,
      freq_unit: getSegmented("seg-freq-unit", "mhz"),
      mem_unit: getSegmented("seg-mem-unit", "mb"),
      bar_thickness: Number(el("bar-thickness").value) || 1,
      ring_thickness: Number(el("ring-thickness").value) || 1,
      icon_scale: Number(el("icon-scale").value) || 1,
      corner_radius: Number(getSegmented("seg-corner-radius", "12")),
    },
  };
}

function applySettingsToForm(settings) {
  activeModel = settings.dashboard_mode || "full";

  // Geral
  el("update-interval").value = settings.update_interval_ms;
  el("dedicated-screen").checked = settings.dedicated_screen === true;
  previewModel = activeModel;

  applyModelToForm(settings.models[activeModel]);
  updateModelBadges();

  // Cards
  el("card-cpu").checked = settings.cards.cpu;
  el("card-gpu").checked = settings.cards.gpu;
  el("card-ram").checked = settings.cards.ram;
  el("card-network").checked = settings.cards.network;
  el("card-storage").checked = settings.cards.storage;
  el("label-cpu").value = settings.labels?.cpu ?? "";
  el("label-gpu").value = settings.labels?.gpu ?? "";

  // Vídeo
  setSegmented("seg-screensaver-mode", settings.screensaver.mode);
  updateCycleTimingVisibility();
  el("ss-show-temps").checked = settings.screensaver.show_temps === true;
  setSegmented("seg-temps-corner", settings.screensaver.temps_corner || "bottom-right");
  el("video-overlay").value = settings.screensaver.overlay_opacity ?? 0.35;
  setSegmented("seg-bg-fit", settings.screensaver.fit || "auto");
  refreshSliderLabels();
  selectClosest("screensaver-interval", settings.screensaver.interval_ms / 1000, INTERVAL_OPTIONS);
  selectClosest("screensaver-duration", settings.screensaver.duration_ms / 1000, DURATION_OPTIONS);
  renderVideoGallery(settings.screensaver.video);
}

function readSettingsFromForm() {
  const selectedThumb = document.querySelector(".video-thumb.selected");

  const models = { ...currentSettings.models };
  models[activeModel] = readModelFromForm();

  return {
    update_interval_ms: Number(el("update-interval").value) || 1000,
    dashboard_mode: activeModel,
    dedicated_screen: el("dedicated-screen").checked,
    language: currentSettings?.language || "auto",
    models,
    cards: {
      cpu: el("card-cpu").checked,
      gpu: el("card-gpu").checked,
      ram: el("card-ram").checked,
      network: el("card-network").checked,
      storage: el("card-storage").checked,
    },
    labels: {
      cpu: el("label-cpu").value.trim(),
      gpu: el("label-gpu").value.trim(),
    },
    screensaver: {
      mode: getSegmented("seg-screensaver-mode", "cycle"),
      interval_ms: Number(el("screensaver-interval").value) * 1000,
      duration_ms: Number(el("screensaver-duration").value) * 1000,
      video: selectedThumb ? selectedThumb.dataset.file : (currentSettings?.screensaver?.video || "aurora.webm"),
      show_temps: el("ss-show-temps").checked,
      temps_corner: getSegmented("seg-temps-corner", "bottom-right"),
      overlay_opacity: Number(el("video-overlay").value),
      fit: getSegmented("seg-bg-fit", "auto"),
    },
  };
}

/** Copies the current model's look onto the other two. */
async function copyModelToOthers() {
  if (!currentSettings) return;
  const source = readModelFromForm();
  for (const name of MODELS) {
    currentSettings.models[name] = JSON.parse(JSON.stringify(source));
  }
  const feedback = el("save-feedback");
  feedback.className = "pending";
  feedback.textContent = t("scope.copied");
}

/* ---------- Video gallery ---------- */

/** Each thumbnail is the video itself: paused on a frame from its first
 *  second, and playing while the mouse is over it. Only metadata is preloaded
 *  so a big gallery doesn't decode every file up front. */
function createVideoThumb(file, selected) {
  const thumb = document.createElement("div");
  thumb.className = "video-thumb" + (selected ? " selected" : "");
  thumb.dataset.file = file;

  // Served by the host's HTTP server, which reads the folder on every
  // request, so freshly uploaded files show up without rebuilding the app.
  const url = `http://localhost:8080/assets/videos/${encodeURIComponent(file)}`;
  const isImage = IMAGE_FILE.test(file);
  const video = document.createElement(isImage ? "img" : "video");
  if (isImage) {
    video.loading = "lazy";
    video.src = url;
  } else {
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(1, (video.duration || 2) / 2);
    }, { once: true });
  }

  const name = document.createElement("div");
  name.className = "video-name";
  name.textContent = file;

  const del = document.createElement("button");
  del.type = "button";
  del.className = "video-delete";
  del.title = t("video.remove");
  del.textContent = "×";
  del.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteVideo(file);
  });

  thumb.append(video, name, del);
  if (!isImage) {
    thumb.addEventListener("mouseenter", () => video.play().catch(() => {}));
    thumb.addEventListener("mouseleave", () => video.pause());
  }
  thumb.addEventListener("click", () => {
    el("video-gallery").querySelectorAll(".video-thumb").forEach((t) => t.classList.remove("selected"));
    thumb.classList.add("selected");
    markDirty();
  });
  return thumb;
}

async function renderVideoGallery(selectedFile) {
  const gallery = el("video-gallery");
  gallery.innerHTML = "";

  let files = [];
  try {
    files = await invoke("list_videos");
  } catch (err) {
    console.error("Failed to list videos", err);
    gallery.innerHTML = `<span class="hint">${t("video.listFailed", { error: err?.message || err })}</span>`;
    return;
  }

  if (files.length === 0) {
    gallery.innerHTML = `<span class="hint">${t("video.empty")}</span>`;
    return;
  }

  for (const file of files) {
    gallery.appendChild(createVideoThumb(file, file === selectedFile));
  }
}

/** The gallery selection that is on screen, falling back to the saved one. */
function selectedVideo() {
  const thumb = document.querySelector(".video-thumb.selected");
  return thumb ? thumb.dataset.file : currentSettings?.screensaver?.video;
}

function setUploadStatus(text, isError = false) {
  const status = el("video-upload-status");
  status.textContent = text;
  status.style.color = isError ? "var(--err)" : "";
}

// Phones decode up to Full HD reliably; bigger files also travel whole through
// the IPC bridge (MAX_VIDEO_BYTES in lib.rs).
const MAX_VIDEO_MB = 80;
const MAX_VIDEO_LONG_SIDE = 1920;
const MAX_VIDEO_SHORT_SIDE = 1080;

const IMAGE_FILE = /\.(jpe?g|png|webp|gif)$/i;
// Same limit as MAX_IMAGE_BYTES in lib.rs; a 4K picture is already sharper than the phone.
const MAX_IMAGE_MB = 15;
const MAX_IMAGE_LONG_SIDE = 3840;

/** Size of a local image file, or null if it can't be decoded here. */
function probeImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const done = (result) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };
    image.onload = () => done({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => done(null);
    image.src = url;
  });
}

/** Resolution of a local video file, or null if it can't be decoded here. */
function probeVideo(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = (result) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };
    video.onloadedmetadata = () => done({ width: video.videoWidth, height: video.videoHeight });
    video.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    video.src = url;
  });
}

/** Why `file` can't go to the gallery, or "" if it can. */
async function videoProblem(file) {
  if (IMAGE_FILE.test(file.name)) {
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      return t("video.imageTooBig", { name: file.name, max: MAX_IMAGE_MB });
    }
    const size = await probeImage(file);
    if (!size || !size.width) return t("video.unsupported", { name: file.name });
    if (Math.max(size.width, size.height) > MAX_IMAGE_LONG_SIDE) {
      return t("video.imageTooLarge", { name: file.name, width: size.width, height: size.height, max: MAX_IMAGE_LONG_SIDE });
    }
    return "";
  }
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    return t("video.tooBig", { name: file.name, max: MAX_VIDEO_MB });
  }
  const size = await probeVideo(file);
  if (!size || !size.width) return t("video.unsupported", { name: file.name });
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  if (long > MAX_VIDEO_LONG_SIDE || short > MAX_VIDEO_SHORT_SIDE) {
    return t("video.tooLarge", { name: file.name, width: size.width, height: size.height });
  }
  return "";
}

async function uploadVideos(fileList) {
  const files = [...fileList];
  if (files.length === 0) return;

  let lastSaved = null;
  for (const [i, file] of files.entries()) {
    const problem = await videoProblem(file);
    if (problem) {
      setUploadStatus(problem, true);
      await renderVideoGallery(selectedVideo());
      return;
    }
    setUploadStatus(t("video.sending", { name: file.name, n: i + 1, total: files.length }));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      lastSaved = await invoke("add_video", bytes, {
        headers: { "x-file-name": encodeURIComponent(file.name) },
      });
    } catch (err) {
      console.error("Failed to add video", err);
      setUploadStatus(t("video.addFailed", { name: file.name, error: err }), true);
      await renderVideoGallery(selectedVideo());
      return;
    }
  }

  setUploadStatus(
    files.length === 1 ? t("video.added", { name: lastSaved }) : t("video.addedMany", { count: files.length })
  );
  await renderVideoGallery(selectedVideo());
}

async function deleteVideo(file) {
  if (file === currentSettings?.screensaver?.video) {
    setUploadStatus(t("video.inUse"), true);
    return;
  }
  if (!confirm(t("video.confirmRemove", { name: file }))) return;

  try {
    await invoke("delete_video", { name: file });
    setUploadStatus(t("video.removed", { name: file }));
  } catch (err) {
    setUploadStatus(t("video.removeFailed", { error: err }), true);
  }
  const current = selectedVideo();
  await renderVideoGallery(current === file ? currentSettings?.screensaver?.video : current);
}

/* ---------- ADB status ---------- */

async function refreshAdbStatus() {
  try {
    const connected = await invoke("get_adb_status");
    const dot = el("adb-dot");
    const text = el("adb-status-text");
    dot.classList.toggle("connected", connected);
    dot.classList.toggle("disconnected", !connected);
    text.textContent = connected ? t("adb.connected") : t("adb.disconnected");
  } catch (err) {
    console.error("Failed to get ADB status", err);
  }
}

/** Shows the detected CPU/GPU names as placeholders for the rename fields. */
async function refreshDetectedNames() {
  try {
    const json = await invoke("get_sample");
    if (!json) return;
    const sample = JSON.parse(json);
    if (sample.cpu_name) el("label-cpu").placeholder = sample.cpu_name;
    if (sample.gpu_name) el("label-gpu").placeholder = sample.gpu_name;
  } catch (err) {
    console.error("Failed to read detected names", err);
  }
}

/** Full recovery: reconnects a stuck phone, restarts adb if needed, rebuilds
 *  the tunnel and reopens the panel. Can take ~15 s in the worst case. */
async function reconnect() {
  const btn = el("reconnect-btn");
  const result = el("reconnect-result");
  btn.disabled = true;
  btn.textContent = t("adb.reconnecting");
  result.style.color = "";
  result.textContent = t("adb.reconnectWait");
  try {
    result.textContent = await invoke("reconnect_adb");
  } catch (err) {
    result.style.color = "var(--err)";
    result.textContent = t("adb.reconnectFailed", { error: err });
  } finally {
    btn.disabled = false;
    btn.textContent = t("adb.reconnect");
    await refreshAdbStatus();
    refreshPhoneStatus();
  }
}

/** Autostart lives in the Windows registry, not in settings.json, so it is
 *  applied as soon as the box changes. */
async function initAutostart() {
  const box = el("autostart");
  try {
    box.checked = await invoke("get_autostart");
  } catch (err) {
    console.error("Failed to read autostart", err);
  }
  box.addEventListener("change", async (event) => {
    event.stopPropagation();
    try {
      await invoke("set_autostart", { enabled: box.checked });
    } catch (err) {
      box.checked = !box.checked;
      alert(err);
    }
  });
}

/* ---------- Phone / app install ---------- */

let installing = false;
let bannerDismissed = false;
// The setup guide opens by itself once when no usable phone is found, so a
// first-time user sees the steps; closing it afterwards sticks.
let setupGuideShown = false;

function setDot(id, kind) {
  const dot = el(id);
  dot.classList.toggle("connected", kind === "ok");
  dot.classList.toggle("disconnected", kind === "err");
  dot.classList.toggle("pending", kind === "pending");
}

async function refreshPhoneStatus() {
  if (installing) return;
  let status;
  try {
    status = await invoke("get_phone_status");
  } catch (err) {
    console.error("Failed to get phone status", err);
    return;
  }

  const ready = status.state === "ready";
  const model = status.model || t("phone.fallbackModel");
  const phoneText = {
    none: t("phone.none"),
    unauthorized: t("phone.unauthorized"),
    offline: t("phone.offline"),
    ready: t("phone.ready", { model }),
  }[status.state] || status.state;
  el("phone-status-text").textContent = phoneText;
  if (!setupGuideShown && (status.state === "none" || status.state === "unauthorized")) {
    el("setup-guide").open = true;
    setupGuideShown = true;
  }
  setDot("phone-dot", ready ? "ok" : status.state === "none" ? "err" : "pending");

  el("copy-apk-btn").disabled = !ready || !status.apk_available;
  el("copy-apk-btn").title = ready ? "" : t("phone.needAuth");

  const installBtn = el("install-app-btn");
  if (!ready) {
    el("app-status-text").textContent = t("app.waiting");
    setDot("app-dot", null);
    installBtn.hidden = true;
  } else if (status.app_installed) {
    el("app-status-text").textContent = t("app.installed");
    setDot("app-dot", "ok");
    installBtn.hidden = !status.apk_available;
    installBtn.textContent = t("app.reinstall");
  } else {
    el("app-status-text").textContent = t("app.notInstalled");
    setDot("app-dot", "err");
    installBtn.hidden = !status.apk_available;
    installBtn.textContent = t("app.install");
  }

  const offerInstall = ready && !status.app_installed && status.apk_available && !bannerDismissed;
  el("install-banner").hidden = !offerInstall;
  el("install-banner-model").textContent = offerInstall ? t("banner.model", { model }) : "";
}

async function installApp() {
  if (installing) return;
  installing = true;
  const buttons = [el("install-app-btn"), el("install-banner-btn")];
  buttons.forEach((b) => (b.disabled = true));
  el("app-status-text").textContent = t("app.installing");
  setDot("app-dot", "pending");
  el("install-banner-btn").textContent = t("banner.installing");

  try {
    await invoke("install_kiosk_app");
    el("install-banner").hidden = true;
    el("app-status-text").textContent = t("app.installDone");
    setDot("app-dot", "ok");
  } catch (err) {
    console.error("Install failed", err);
    el("app-status-text").textContent = t("app.installFailed", { error: err });
    setDot("app-dot", "err");
    el("manual-install").open = true;
  } finally {
    installing = false;
    buttons.forEach((b) => (b.disabled = false));
    el("install-banner-btn").textContent = t("banner.install");
    // Keep the result on screen for a moment before polling overwrites it.
    setTimeout(refreshPhoneStatus, 5000);
  }
}

async function copyApkToPhone() {
  const status = el("manual-status");
  el("copy-apk-btn").disabled = true;
  status.style.color = "";
  status.textContent = t("manual.copying");
  try {
    const where = await invoke("copy_apk_to_phone");
    status.textContent = t("manual.copied", { where });
  } catch (err) {
    status.style.color = "var(--err)";
    status.textContent = t("manual.copyFailed", { error: err });
  } finally {
    el("copy-apk-btn").disabled = false;
  }
}

async function revealApk() {
  try {
    await invoke("reveal_apk");
  } catch (err) {
    el("manual-status").style.color = "var(--err)";
    el("manual-status").textContent = t("manual.revealFailed", { error: err });
  }
}

/* ---------- Load / save ---------- */

/* ---------- Language ---------- */

/** Applies "auto" | "pt-BR" | "en" to everything on screen. */
async function applyLanguage(setting) {
  let language = setting;
  if (setting !== "pt-BR" && setting !== "en") {
    try {
      language = await invoke("system_language");
    } catch (err) {
      language = navigator.language?.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
    }
  }
  setLanguage(language);
  translatePage();

  // Parts built by script.
  fillSelect("screensaver-interval", INTERVAL_OPTIONS);
  fillSelect("screensaver-duration", DURATION_OPTIONS);
  for (const id of Object.keys(SENSOR_LISTS)) {
    renderSensorList(id, readSensorList(id));
  }
  renderMiniEditor();
  renderPresets();
  updateModelBadges();
  if (el("save-feedback").className === "pending") markDirty();
  refreshAdbStatus();
  refreshPhoneStatus();
}

function initLanguagePicker() {
  const select = el("language-select");
  select.addEventListener("change", async () => {
    const language = select.value;
    try {
      await invoke("set_language", { language });
      if (currentSettings) currentSettings.language = language;
    } catch (err) {
      console.error("Failed to save language", err);
    }
    await applyLanguage(language);
    renderVideoGallery(selectedVideo());
  });
}

/* ---------- Load / save ---------- */

async function loadSettings() {
  currentSettings = await invoke("get_settings");
  el("language-select").value = currentSettings.language || "auto";
  await applyLanguage(currentSettings.language || "auto");
  applySettingsToForm(currentSettings);
  clearDirty();
}

async function saveSettings() {
  const settings = readSettingsFromForm();
  try {
    await invoke("save_settings", { settings });
    currentSettings = settings;
    clearDirty(t("save.saved"));
    setTimeout(() => clearDirty(), 2500);
  } catch (err) {
    console.error("Failed to save settings", err);
    const feedback = el("save-feedback");
    feedback.className = "error";
    feedback.textContent = t("save.error");
  }
}

async function resetSettings() {
  try {
    currentSettings = await invoke("reset_settings");
    applySettingsToForm(currentSettings);
    clearDirty(t("save.restored"));
    setTimeout(() => clearDirty(), 2500);
  } catch (err) {
    console.error("Failed to reset settings", err);
  }
}

/* ---------- Init ---------- */

window.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initSegmentedControls();
  initSliders();
  initPresets();
  initVersion();
  initModelGallery();
  initLanguagePicker();
  fillSelect("screensaver-interval", INTERVAL_OPTIONS);
  fillSelect("screensaver-duration", DURATION_OPTIONS);
  el("screensaver-interval").addEventListener("change", markDirty);
  el("screensaver-duration").addEventListener("change", markDirty);

  document
    .querySelectorAll('input[type="color"], input[type="text"], input[type="checkbox"]:not(#autostart)')
    .forEach((input) => input.addEventListener("input", markDirty));

  loadSettings();
  refreshDetectedNames();
  setTimeout(refreshDetectedNames, 2000);
  refreshAdbStatus();
  setInterval(refreshAdbStatus, ADB_POLL_INTERVAL_MS);
  refreshPhoneStatus();
  setInterval(refreshPhoneStatus, PHONE_POLL_INTERVAL_MS);

  el("install-app-btn").addEventListener("click", installApp);
  el("copy-apk-btn").addEventListener("click", copyApkToPhone);
  el("reveal-apk-btn").addEventListener("click", revealApk);
  el("install-banner-btn").addEventListener("click", installApp);
  el("install-banner-dismiss").addEventListener("click", () => {
    bannerDismissed = true;
    el("install-banner").hidden = true;
  });

  el("reconnect-btn").addEventListener("click", reconnect);
  initAutostart();

  el("save-btn").addEventListener("click", saveSettings);
  el("reset-btn").addEventListener("click", resetSettings);
  el("add-video-btn").addEventListener("click", () => el("add-video-input").click());
  el("add-video-input").addEventListener("change", async (event) => {
    await uploadVideos(event.target.files);
    event.target.value = "";
  });
  el("copy-model-1").addEventListener("click", copyModelToOthers);
  el("copy-model-2").addEventListener("click", copyModelToOthers);

  el("preview-btn").addEventListener("click", async () => {
    try {
      await invoke("open_preview", { model: null });
    } catch (err) {
      console.error("Failed to open preview", err);
    }
  });
});
