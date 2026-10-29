const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
const WS_URL = "ws://localhost:8080";
const RECONNECT_DELAY_MS = 2000;

const DEFAULT_SCREENSAVER_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_SCREENSAVER_DURATION_MS = 30 * 1000;

const SCALE_MAX = {
  temp: 100,
  cpuClock: 5000,
  gpuClock: 3000,
  fan: 2000,
};

let dashboardMode = "full";
let lastStorageAvg = 0;

// Custom CPU/GPU names from the settings; empty means "use the detected name".
let deviceLabels = { cpu: "", gpu: "" };

// Keys match `font_family` in the settings; the faces live in fonts.css.
const SYSTEM_FONT = '"Segoe UI", Roboto, -apple-system, sans-serif';
const FONT_STACKS = {
  system: SYSTEM_FONT,
  inter: `"Inter", ${SYSTEM_FONT}`,
  rajdhani: `"Rajdhani", ${SYSTEM_FONT}`,
  orbitron: `"Orbitron", ${SYSTEM_FONT}`,
  exo2: `"Exo 2", ${SYSTEM_FONT}`,
  chakra: `"Chakra Petch", ${SYSTEM_FONT}`,
  oxanium: `"Oxanium", ${SYSTEM_FONT}`,
  // Whatever monospace font the device has (Consolas on Windows, Droid Sans Mono on Android).
  mono: '"Cascadia Mono", Consolas, "Roboto Mono", "Droid Sans Mono", monospace',
};

// Formatting preferences, refreshed from /config.json on each poll.
let displayConfig = {
  clock_format: "24h",
  freq_unit: "mhz",
  mem_unit: "mb",
};

function decimal(value, digits) {
  return value.toFixed(digits).replace(".", ",");
}

function formatFreq(mhz) {
  if (displayConfig.freq_unit === "ghz") {
    return `${decimal(mhz / 1000, 2)} GHz`;
  }
  return `${Math.round(mhz)} MHz`;
}

// The graph model's gauges are small, so the unit lives on the graph axis and
// the ring shows the bare number in whichever unit the user picked.
function formatFreqValue(mhz) {
  if (displayConfig.freq_unit === "ghz") {
    return decimal(mhz / 1000, 2);
  }
  return String(Math.round(mhz));
}

function formatMem(mb) {
  if (displayConfig.mem_unit === "gb") {
    return `${decimal(mb / 1024, 1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

function formatNet(kbs) {
  if (kbs >= 1024) {
    return `${decimal(kbs / 1024, 1)} MB/s`;
  }
  return `${decimal(kbs, 1)} KB/s`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setBar(id, percent) {
  const el = document.getElementById(id);
  if (el) el.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function setRing(id, percent) {
  const el = document.getElementById(id);
  if (!el) return;
  const clamped = Math.max(0, Math.min(100, percent));
  el.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - clamped / 100);
}

/** Length of the minimal model's arc, measured on a path inside the always
 *  rendered <defs> SVG (paths in hidden panels can measure as 0). */
let miniArcLength = 0;
function measureMiniArc() {
  if (miniArcLength) return miniArcLength;
  const svg = document.querySelector("svg defs")?.ownerSVGElement;
  if (!svg) return 0;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", MINI_ARC);
  svg.appendChild(path);
  miniArcLength = path.getTotalLength();
  path.remove();
  return miniArcLength;
}

function initMiniRingLengths() {
  const length = measureMiniArc();
  document.querySelectorAll(".mini-fill").forEach((el) => {
    el.style.strokeDasharray = String(length);
    el.style.strokeDashoffset = String(length);
    el.dataset.length = String(length);
  });
}

/** Sets an arc drawn with `.mini-fill` to `ratio` (0-1). */
function setArcRatio(id, ratio) {
  const el = document.getElementById(id);
  if (!el) return;
  const length = Number(el.dataset.length) || measureMiniArc();
  el.style.strokeDashoffset = length * (1 - Math.max(0, Math.min(1, ratio)));
}

/* ---------- Minimal model: user-chosen rings ---------- */

// Scales for sensors without a natural 0-100 range. Power, network and FPS
// also grow with the highest value seen, so a big GPU never pins at 100%.
const CPU_POWER_MAX = 150;
const FPS_MAX = 144;
const peaks = {};

function peak(key, value, floor) {
  peaks[key] = Math.max(peaks[key] || floor, value);
  return peaks[key];
}

function clockUnit() {
  return displayConfig.freq_unit === "ghz" ? "GHZ" : "MHZ";
}

function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}
function pct(v) {
  return isNum(v) ? { text: `${Math.round(v)}%`, ratio: v / 100 } : null;
}
function temp(v) {
  return isNum(v) ? { text: `${Math.round(v)}°C`, ratio: v / SCALE_MAX.temp } : null;
}
function clock(mhz, max) {
  return isNum(mhz) ? { text: formatFreqValue(mhz), ratio: mhz / max } : null;
}
function watts(key, w, floor) {
  return isNum(w) ? { text: `${Math.round(w)}W`, ratio: w / peak(key, w, floor) } : null;
}
function net(key, kbs) {
  if (!isNum(kbs)) return null;
  const reading = kbs >= 1024
    ? { text: decimal(kbs / 1024, 1), unit: "MB/S" }
    : { text: String(Math.round(kbs)), unit: "KB/S" };
  return { ...reading, ratio: kbs / peak(key, kbs, 100) };
}

/** Every sensor the minimal model can show. `read` returns null when the
 *  sample doesn't carry it (sensor missing, card disabled, no game running). */
const MINI_SENSORS = {
  cpu_load: { caption: () => "CPU", read: (d) => pct(d.cpu_load) },
  cpu_temp: { caption: () => "CPU TEMP", read: (d) => temp(d.cpu_temp) },
  cpu_clock: { caption: () => `CPU ${clockUnit()}`, read: (d) => clock(d.cpu_clock, SCALE_MAX.cpuClock) },
  cpu_power: { caption: () => "CPU POWER", read: (d) => watts("cpu_power", d.cpu_power, CPU_POWER_MAX) },
  gpu_load: { caption: () => "GPU", read: (d) => pct(d.gpu_load) },
  gpu_temp: { caption: () => "GPU TEMP", read: (d) => temp(d.gpu_temp) },
  gpu_clock: { caption: () => `GPU ${clockUnit()}`, read: (d) => clock(d.gpu_clock, SCALE_MAX.gpuClock) },
  gpu_power: { caption: () => "GPU POWER", read: (d) => watts("gpu_power", d.gpu_power, d.gpu_power_limit || 300) },
  gpu_fan: { caption: () => "GPU FAN", read: (d) => pct(d.gpu_fan) },
  vram: {
    caption: () => "VRAM",
    read: (d) => (isNum(d.gpu_mem_used_mb) && d.gpu_mem_total_mb ? pct((d.gpu_mem_used_mb / d.gpu_mem_total_mb) * 100) : null),
  },
  ram_load: { caption: () => "RAM", read: (d) => pct(d.ram_load) },
  disk: { caption: () => "DISK", read: (d) => (Array.isArray(d.storage) && d.storage.length ? pct(lastStorageAvg) : null) },
  net_down: { caption: (r) => `DOWN ${r ? r.unit : "KB/S"}`, read: (d) => net("net_down", d.net_down_kbs) },
  net_up: { caption: (r) => `UP ${r ? r.unit : "KB/S"}`, read: (d) => net("net_up", d.net_up_kbs) },
  fps: {
    caption: () => "FPS",
    read: (d) => (isNum(d.fps) ? { text: String(Math.round(d.fps)), ratio: d.fps / peak("fps", d.fps, FPS_MAX) } : null),
  },
};

const DEFAULT_MINI_SENSORS = ["cpu_load", "ram_load", "gpu_load", "cpu_temp", "gpu_temp", "disk"];
const MINI_ARC = "M22 138 A 68 68 0 1 1 138 138";
let miniSignature = null;

/** Rebuilds the rings when the chosen sensors change. */
function buildMiniRings(keys) {
  const valid = (keys || []).filter((k) => MINI_SENSORS[k]);
  const signature = valid.join(",");
  if (signature === miniSignature) return;
  miniSignature = signature;

  const container = document.getElementById("dashboard-minimal");
  container.innerHTML = valid
    .map(
      (key) => `
      <div class="mini-ring" data-sensor="${key}">
        <svg viewBox="0 20 160 130">
          <path class="mini-track" d="${MINI_ARC}" />
          <path class="mini-fill" d="${MINI_ARC}" />
          <text class="mini-value" x="80" y="97">--</text>
          <text class="mini-caption" x="80" y="129">${MINI_SENSORS[key].caption(null)}</text>
        </svg>
      </div>`
    )
    .join("");
  initMiniRingLengths();
  layoutMiniGrid();
}

/** Picks the column count that makes the rings as big as possible for the
 *  space available, so 2 sensors fill the screen as well as 6 do. A row that
 *  isn't full stays centered. */
function layoutMiniGrid() {
  const container = document.getElementById("dashboard-minimal");
  if (!container || container.hidden) return;
  const count = container.children.length;
  if (count === 0) return;

  const { width, height } = container.getBoundingClientRect();
  const ringAspect = 160 / 130;
  let best = { cols: 1, size: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const size = Math.min(width / cols, (height / rows) * ringAspect);
    if (size > best.size) best = { cols, size };
  }
  container.style.setProperty("--mini-cols", best.cols);
  container.style.setProperty("--mini-rows", Math.ceil(count / best.cols));
}

function updateMiniRings(data) {
  document.querySelectorAll("#dashboard-minimal .mini-ring").forEach((ring) => {
    const sensor = MINI_SENSORS[ring.dataset.sensor];
    const reading = sensor.read(data);
    const fill = ring.querySelector(".mini-fill");
    const length = Number(fill.dataset.length) || 0;
    const ratio = reading ? Math.max(0, Math.min(1, reading.ratio)) : 0;
    fill.style.strokeDashoffset = length * (1 - ratio);
    ring.querySelector(".mini-value").textContent = reading ? reading.text : "--";
    ring.querySelector(".mini-caption").textContent = sensor.caption(reading);
  });
}

window.addEventListener("resize", layoutMiniGrid);
window.addEventListener("resize", () => updateCardZoom());


function cpuName(data) {
  return deviceLabels.cpu.trim() || data.cpu_name;
}

function gpuName(data) {
  return deviceLabels.gpu.trim() || data.gpu_name;
}

function updateClock() {
  const now = new Date();
  const hours24 = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");

  if (displayConfig.clock_format === "12h") {
    const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const suffix = hours24 >= 12 ? "PM" : "AM";
    setText("clock", `${hours}:${minutes} ${suffix}`);
  } else {
    setText("clock", `${String(hours24).padStart(2, "0")}:${minutes}`);
  }
}

function renderStorage(drives) {
  const container = document.getElementById("storage-list");
  if (container && Array.isArray(drives)) {
    container.innerHTML = "";
    for (const drive of drives) {
      const row = document.createElement("div");
      row.className = "storage-row";
      row.innerHTML = `
        <span class="storage-name">${drive.name}</span>
        <div class="bar"><div class="bar-fill" style="width:${drive.percent}%"></div></div>
        <span class="storage-pct">${drive.percent}%</span>
      `;
      container.appendChild(row);
    }
  }

  if (Array.isArray(drives) && drives.length > 0) {
    lastStorageAvg = drives.reduce((sum, d) => sum + d.percent, 0) / drives.length;
  }
}

/** FPS only exists while a 3D app is running under RTSS; otherwise the host
 *  leaves it out and the counter goes idle instead of disappearing, so the
 *  top bar doesn't jump around. */
function applyFps(fps) {
  const el = document.getElementById("fps");
  if (!el) return;
  const hasFps = typeof fps === "number";
  el.classList.toggle("idle", !hasFps);
  setText("fps-value", hasFps ? Math.round(fps) : "--");
}

function applyTempsSample(data) {
  for (const kind of ["cpu", "gpu"]) {
    const value = data[`${kind}_temp`];
    if (typeof value !== "number") continue;
    const rounded = Math.round(value);
    setText(`temps-${kind}`, rounded);
    setText(`temps-${kind}-ring-value`, rounded);
    setArcRatio(`temps-${kind}-ring`, value / SCALE_MAX.temp);
    setText(`ss-${kind}-temp`, `${rounded}°`);
  }
}

/* ---------- Glass model ---------- */

const GLASS_RING_LENGTH = 2 * Math.PI * 50;

function setGlassRing(id, percent) {
  const el = document.getElementById(id);
  if (!el) return;
  const clamped = Math.max(0, Math.min(100, percent));
  el.style.strokeDasharray = String(GLASS_RING_LENGTH);
  el.style.strokeDashoffset = String(GLASS_RING_LENGTH * (1 - clamped / 100));
}

function setWidth(id, percent) {
  const el = document.getElementById(id);
  if (el) el.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

/* ---------- Glass model: background and frost ---------- */

// CSS backdrop-filter took ~100 ms per frame on a low-end phone, so the
// glass look is drawn by hand on tiny canvases that CSS stretches to the
// screen (the stretch is the blur): the phone only composites two small
// textures, and the canvases redraw GLASS_FPS times a second at most.
const AURORA_WIDTH = 192;
const GLASS_FPS = 15;
// Copying a video frame costs more (it is read back from the GPU), and a
// blurred copy changing 8 times a second looks just as alive.
const FROST_FPS = 8;

let glassTimer = null;
let glassFrosted = false;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** "#ff7a1a" -> "255,122,26" (for rgba()). */
function hexToRgb(hex, fallback = "255,122,26") {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || "");
  return m ? m.slice(1).map((h) => parseInt(h, 16)).join(",") : fallback;
}

/** Three soft blobs in the accent colors, drifting slowly when animated. */
function drawAurora(time) {
  const canvas = document.getElementById("glass-aurora");
  if (!canvas) return;
  const w = AURORA_WIDTH;
  const h = Math.max(1, Math.round((AURORA_WIDTH * innerHeight) / innerWidth));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = cssVar("--bg") || "#07070b";
  ctx.fillRect(0, 0, w, h);

  const a = hexToRgb(cssVar("--accent"));
  const b = hexToRgb(cssVar("--accent-2"), a);
  const mix = a.split(",").map((v, i) => Math.round((Number(v) + Number(b.split(",")[i])) / 2)).join(",");
  const s = time / 1000;
  // color, center x/y (fractions of the screen), radius (fraction of width),
  // drift periods in seconds, opacity
  const blobs = [
    [a, 0.18, 0.05, 0.5, 31, 23, 0.6],
    [b, 0.86, 0.22, 0.48, 37, 29, 0.55],
    [mix, 0.5, 1.12, 0.55, 43, 34, 0.45],
  ];
  ctx.globalCompositeOperation = "lighter";
  for (const [color, x, y, r, px, py, alpha] of blobs) {
    const cx = (x + 0.14 * Math.sin((2 * Math.PI * s) / px)) * w;
    const cy = (y + 0.22 * Math.cos((2 * Math.PI * s) / py)) * h;
    const radius = r * w;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(0.55, `rgba(${color},${alpha * 0.45})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = "source-over";
}

function roundedRect(x, y, w, h, r) {
  return (
    `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} ` +
    `A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} ` +
    `V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
  );
}

/** The frosted video only shows through the cards' shapes. */
function updateFrostClip() {
  const frost = document.getElementById("glass-frost");
  if (!frost) return;
  const shapes = [...document.querySelectorAll("#dashboard-glass .glass-card")].map((card) => {
    const r = card.getBoundingClientRect();
    const radius = Math.min(parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0, r.width / 2, r.height / 2);
    return roundedRect(r.left, r.top, r.width, r.height, radius);
  });
  frost.style.clipPath = `path("${shapes.join(" ")}")`;
}

/** The part of the video that's on screen (object-fit: cover), shrunk into
 *  a canvas a few dozen pixels wide and darkened like the video itself. */
/** The fit actually used: "auto" crops videos to fill the screen but shows a
 *  picture whole, so a wallpaper isn't zoomed in on. */
function backgroundFit(isImage) {
  const fit = document.documentElement.dataset.fit || "auto";
  return fit === "auto" ? (isImage ? "contain" : "cover") : fit;
}

/** A picture shown whole leaves bars; a blurred, darkened copy of it fills
 *  them instead of plain black (static, so it costs nothing). */
function updateBackdrop(file) {
  const backdrop = document.getElementById("screensaver-backdrop");
  if (!backdrop) return;
  const show = isImageFile(file) && backgroundFit(true) === "contain";
  backdrop.hidden = !show;
  const src = show ? `/assets/videos/${encodeURIComponent(file)}` : "";
  if (show && backdrop.getAttribute("src") !== src) backdrop.src = src;
  if (!show) backdrop.removeAttribute("src");
}

function drawFrost() {
  const image = document.getElementById("screensaver-img");
  const useImage = image && !image.hidden;
  const video = useImage ? image : document.getElementById("screensaver");
  const canvas = document.getElementById("glass-frost");
  const sourceWidth = useImage ? image.naturalWidth : video?.videoWidth;
  const sourceHeight = useImage ? image.naturalHeight : video?.videoHeight;
  if (!video || !canvas || !sourceWidth || (!useImage && video.readyState < 2)) return;
  const blur = Math.max(0.1, Number(displayConfig.glass_blur) || 1);
  const w = Math.max(8, Math.round(innerWidth / (4 + 10 * blur)));
  const h = Math.max(4, Math.round((w * innerHeight) / innerWidth));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  const fit = backgroundFit(useImage);
  if (fit === "fill") {
    ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight, 0, 0, w, h);
  } else if (fit === "contain") {
    const scale = Math.min(w / sourceWidth, h / sourceHeight);
    const dw = sourceWidth * scale;
    const dh = sourceHeight * scale;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    const scale = Math.max(innerWidth / sourceWidth, innerHeight / sourceHeight);
    const sw = innerWidth / scale;
    const sh = innerHeight / scale;
    ctx.drawImage(video, (sourceWidth - sw) / 2, (sourceHeight - sh) / 2, sw, sh, 0, 0, w, h);
  }
  const overlay = parseFloat(cssVar("--video-overlay"));
  ctx.fillStyle = `rgba(0,0,0,${Number.isFinite(overlay) ? overlay : 0.35})`;
  ctx.fillRect(0, 0, w, h);
}

function glassTick() {
  if (document.hidden) return;
  if (glassFrosted) drawFrost();
  else drawAurora(performance.now());
}

/** Starts, stops or refreshes the glass background for the current model,
 *  video mode and options. Called whenever any of them may have changed. */
function updateGlassEffects() {
  const active = dashboardMode === "glass";
  const videoBehind = document.body.classList.contains("bg-always");
  const aurora = document.getElementById("glass-aurora");
  if (aurora) aurora.hidden = !active || videoBehind;

  // Blurring a playing video is heavy, so it's opt-in; a still picture is
  // blurred once, for free.
  const stillBehind = document.body.classList.contains("bg-image");
  glassFrosted = active && videoBehind && (Number(displayConfig.glass_blur) || 0) > 0 && (stillBehind || displayConfig.glass_frost === true);
  document.body.classList.toggle("glass-frosted", glassFrosted);

  clearInterval(glassTimer);
  glassTimer = null;
  if (!active) return;
  if (glassFrosted) {
    updateFrostClip();
    drawFrost();
  } else if (!videoBehind) {
    drawAurora(performance.now());
  }
  const stillImage = document.body.classList.contains("bg-image");
  const moving = (glassFrosted && !stillImage) || (!videoBehind && displayConfig.glass_animated_bg !== false);
  if (moving) glassTimer = setInterval(glassTick, 1000 / (glassFrosted ? FROST_FPS : GLASS_FPS));
}

window.addEventListener("resize", () => {
  if (dashboardMode === "glass") updateGlassEffects();
});

/** The Glass and AMOLED models have the same cards; only the id prefix
 *  ("glass" / "am") and the look in CSS differ. */
function applyCardsSample(data) {
  const prefix = dashboardMode === "glass" ? "glass" : dashboardMode === "amoled" ? "am" : null;
  if (!prefix) return;
  if (data.cpu_name) setText(`${prefix}-cpu-name`, cpuName(data));
  if (data.gpu_name) setText(`${prefix}-gpu-name`, gpuName(data));

  for (const kind of ["cpu", "gpu"]) {
    const load = data[`${kind}_load`];
    if (typeof load === "number") {
      setText(`${prefix}-${kind}-load`, Math.round(load));
      setGlassRing(`${prefix}-${kind}-ring`, load);
    }
    const temp = data[`${kind}_temp`];
    setText(`${prefix}-${kind}-temp`, typeof temp === "number" ? Math.round(temp) : "--");
    const clock = data[`${kind}_clock`];
    setText(`${prefix}-${kind}-clock`, typeof clock === "number" ? formatFreq(clock) : "--");
    const power = data[`${kind}_power`];
    setText(`${prefix}-${kind}-power`, typeof power === "number" ? `${Math.round(power)} W` : "--");
  }

  if (typeof data.ram_load === "number") {
    setText(`${prefix}-ram-load`, Math.round(data.ram_load));
    setWidth(`${prefix}-ram-bar`, data.ram_load);
  }
  if (typeof data.ram_used_mb === "number" && typeof data.ram_free_mb === "number") {
    setText(`${prefix}-ram-detail`, `${formatMem(data.ram_used_mb)} / ${formatMem(data.ram_used_mb + data.ram_free_mb)}`);
  }
  if (typeof data.gpu_mem_used_mb === "number" && data.gpu_mem_total_mb) {
    const percent = (data.gpu_mem_used_mb / data.gpu_mem_total_mb) * 100;
    setText(`${prefix}-vram-load`, Math.round(percent));
    setText(`${prefix}-vram-detail`, `${formatMem(data.gpu_mem_used_mb)} / ${formatMem(data.gpu_mem_total_mb)}`);
    setWidth(`${prefix}-vram-bar`, percent);
  }
  if (typeof data.net_down_kbs === "number") setText(`${prefix}-net-down`, formatNet(data.net_down_kbs));
  if (typeof data.net_up_kbs === "number") setText(`${prefix}-net-up`, formatNet(data.net_up_kbs));

  const drives = document.getElementById(`${prefix}-drives`);
  if (drives && Array.isArray(data.storage)) {
    drives.innerHTML = data.storage
      .slice(0, 3)
      .map(
        (d) => `<div class="${prefix}-drive"><span>${d.name.replace(/\\$/, "")}</span>` +
          `<div class="${prefix}-bar"><i style="width:${Math.max(0, Math.min(100, d.percent))}%"></i></div>` +
          `<b>${d.percent}%</b></div>`
      )
      .join("");
  }
}

/* ---------- Afterburner model: lines of text, like MSI's on-screen display ---------- */

const OSD_GROUP_ORDER = ["CPU", "GPU", "RAM", "FPS"];
// Afterburner sensors that need no caption inside their group: the line's
// label ("GPU") and the unit already say what they are.
const OSD_PLAIN_SOURCES = new Set([0x00, 0x20, 0x30, 0x50, 0x61, 0x80, 0x90, 0x91, 0xa0, 0x100]);

function osdLabel(key, fallback) {
  const custom = (displayConfig.osd_labels || {})[key];
  return custom && custom.trim() ? custom.trim() : fallback;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/** Value and unit as text, honoring the MHz/GHz and MB/GB choices. */
function osdFormat(value, units) {
  if (!isNum(value)) return { text: "--", unit: "" };
  const unit = (units || "").trim();
  if (unit === "MB") {
    return displayConfig.mem_unit === "gb"
      ? { text: decimal(value / 1024, 1), unit: "GB" }
      : { text: String(Math.round(value)), unit: "MB" };
  }
  if (unit === "MHz") {
    return displayConfig.freq_unit === "ghz"
      ? { text: decimal(value / 1000, 2), unit: "GHz" }
      : { text: String(Math.round(value)), unit: "MHz" };
  }
  if (unit === "ms") return { text: decimal(value, 1), unit };
  if (unit === "V") return { text: decimal(value, 3), unit };
  return { text: String(Math.round(value)), unit };
}

function osdGroupOf(item) {
  const source = item.source;
  if (source >= 0x50 && source < 0x60) return "FPS";
  if (source === 0x91 || source === 0x92) return "RAM";
  if (source >= 0x80 || /^cpu/i.test(item.name)) return "CPU";
  return "GPU";
}

function osdCaption(item, group) {
  if (group === "FPS") return item.source === 0x50 ? "" : item.name.replace(/^framerate\s*/i, "") || item.name;
  if (OSD_PLAIN_SOURCES.has(item.source)) return "";
  return item.source === 0x31 ? "VRAM" : item.name;
}

/** Same sensors Afterburner shows in its own OSD, grouped into one line per
 *  device (CPU, GPU, RAM, frame stats). */
function osdFromAfterburner(items) {
  const groups = new Map();
  for (const item of items) {
    const group = osdGroupOf(item);
    if (!groups.has(group)) groups.set(group, []);
    const units = item.units || (item.source === 0x00 || item.source === 0x80 ? "°C" : "");
    groups.get(group).push({ ...osdFormat(item.value, units), caption: osdCaption(item, group) });
  }
  return [...groups.keys()]
    .sort((a, b) => OSD_GROUP_ORDER.indexOf(a) - OSD_GROUP_ORDER.indexOf(b))
    .map((label) => ({ label: osdLabel(label.toLowerCase(), label), items: groups.get(label) }));
}

function osdItem(value, units, caption = "") {
  return isNum(value) ? { ...osdFormat(value, units), caption } : null;
}

/** Lines the user can pick without Afterburner (see `osd_lines`). */
const OSD_LINES = {
  cpu: {
    label: "CPU",
    items: (d) => [osdItem(d.cpu_temp, "°C"), osdItem(d.cpu_load, "%"), osdItem(d.cpu_clock, "MHz"), osdItem(d.cpu_power, "W")],
  },
  gpu: {
    label: "GPU",
    items: (d) => [
      osdItem(d.gpu_temp, "°C"),
      osdItem(d.gpu_load, "%"),
      osdItem(d.gpu_clock, "MHz"),
      osdItem(d.gpu_power, "W"),
      osdItem(d.gpu_fan, "%", "FAN"),
    ],
  },
  vram: {
    label: "VRAM",
    items: (d) => [
      osdItem(d.gpu_mem_used_mb, "MB"),
      isNum(d.gpu_mem_used_mb) && d.gpu_mem_total_mb ? osdItem((d.gpu_mem_used_mb / d.gpu_mem_total_mb) * 100, "%") : null,
    ],
  },
  ram: { label: "RAM", items: (d) => [osdItem(d.ram_used_mb, "MB"), osdItem(d.ram_load, "%")] },
  fps: {
    label: "FPS",
    always: true,
    items: (d) => [
      osdItem(d.fps, "FPS") || { text: "--", unit: "FPS", caption: "" },
      osdItem(d.frametime, "ms", "Frametime"),
      osdItem(d.fps_1low, "FPS", "1% Low"),
      osdItem(d.fps_01low, "FPS", "0.1% Low"),
      osdItem(d.fps_avg, "FPS", "Avg"),
    ],
  },
  net: {
    label: "NET",
    items: (d) => {
      const speed = (kbs, caption) => {
        if (!isNum(kbs)) return null;
        return kbs >= 1024 ? { text: decimal(kbs / 1024, 1), unit: "MB/s", caption } : { text: String(Math.round(kbs)), unit: "KB/s", caption };
      };
      return [speed(d.net_down_kbs, "↓"), speed(d.net_up_kbs, "↑")];
    },
  },
  disk: {
    label: "DISK",
    items: (d) => (Array.isArray(d.storage) ? d.storage.map((drive) => ({ text: String(drive.percent), unit: "%", caption: drive.name.replace(/\$/, "") })) : []),
  },
};

function osdCustom(data) {
  const keys = Array.isArray(displayConfig.osd_lines) ? displayConfig.osd_lines : ["cpu", "gpu", "ram", "fps"];
  return keys
    .filter((key) => OSD_LINES[key])
    .map((key) => ({ key, def: OSD_LINES[key], items: OSD_LINES[key].items(data).filter(Boolean) }))
    .filter(({ def, items }) => items.length > 0 || def.always)
    .map(({ key, def, items }) => ({ label: osdLabel(key, def.label), items }));
}

let osdFit = 0;

/** Grows the text until the lines fill the screen. It only changes size when
 *  the fit moves clearly, so a number gaining a digit doesn't make the whole
 *  overlay jump every second. */
function fitOsd() {
  const panel = document.getElementById("dashboard-osd");
  const box = document.getElementById("osd-lines");
  if (!panel || !box || panel.hidden) return;
  const probe = 20;
  box.style.fontSize = `${probe}px`;
  const width = box.scrollWidth;
  const height = box.scrollHeight;
  if (!width || !height) return;
  const fit = Math.min((panel.clientWidth * 0.94) / width, (panel.clientHeight * 0.94) / height);
  if (!osdFit || fit < osdFit * 0.99 || fit > osdFit * 1.12) osdFit = fit;
  const size = Math.min(probe * osdFit, innerHeight * 0.14);
  box.style.fontSize = `${size * Math.min(1, Math.max(0.3, Number(displayConfig.osd_scale) || 1))}px`;
}

const osdSlotWidth = new Map();

function applyOsdSample(data) {
  if (dashboardMode !== "osd") return;
  const mirror = displayConfig.osd_source !== "custom" && Array.isArray(data.osd) && data.osd.length > 0;
  const lines = mirror ? osdFromAfterburner(data.osd) : osdCustom(data);
  document.getElementById("osd-lines").innerHTML = lines
    .map(
      (line) =>
        `<div class="osd-line"><span class="osd-label">${escapeHtml(line.label)}</span>` +
        line.items
          .map((it, col) => {
            // Each value slot keeps the widest text it has shown (right
            // aligned), so 9 -> 10 doesn't shift the line or rescale the block.
            const slot = `${line.label}#${col}`;
            const width = Math.max(osdSlotWidth.get(slot) || 3, String(it.text).length);
            osdSlotWidth.set(slot, width);
            return (
              `<span class="osd-item${it.text === "--" ? " osd-na" : ""}">` +
              (it.caption ? `<small>${escapeHtml(it.caption)}</small>` : "") +
              `<b style="min-width:${width}ch">${escapeHtml(it.text)}</b>` +
              (it.unit ? `<i>${escapeHtml(it.unit)}</i>` : "") +
              `</span>`
            );
          })
          .join("") +
        `</div>`
    )
    .join("");
  fitOsd();
}

window.addEventListener("resize", () => {
  osdFit = 0;
  fitOsd();
});

function applySample(data) {
  if (data.cpu_name) setText("cpu-name", cpuName(data));
  if (data.gpu_name) setText("gpu-name", gpuName(data));

  if (typeof data.cpu_load === "number") {
    setText("cpu-load", Math.round(data.cpu_load));
    setRing("cpu-ring", data.cpu_load);
  }
  if (typeof data.cpu_temp === "number") {
    setText("cpu-temp-value", `${Math.round(data.cpu_temp)}°C`);
    setBar("cpu-temp-bar", (data.cpu_temp / SCALE_MAX.temp) * 100);
  }
  if (typeof data.cpu_clock === "number") {
    setText("cpu-clock-value", formatFreq(data.cpu_clock));
    setBar("cpu-clock-bar", (data.cpu_clock / SCALE_MAX.cpuClock) * 100);
  }
  if (typeof data.cpu_power === "number") {
    setText("cpu-power-value", `${Math.round(data.cpu_power)} W`);
    setBar("cpu-power-bar", (data.cpu_power / peak("cpu_power", data.cpu_power, CPU_POWER_MAX)) * 100);
  }

  if (typeof data.gpu_load === "number") {
    setText("gpu-load", Math.round(data.gpu_load));
    setRing("gpu-ring", data.gpu_load);
  }
  if (typeof data.gpu_temp === "number") {
    setText("gpu-temp-value", `${Math.round(data.gpu_temp)}°C`);
    setBar("gpu-temp-bar", (data.gpu_temp / SCALE_MAX.temp) * 100);
  }
  if (typeof data.gpu_clock === "number") {
    setText("gpu-clock-value", formatFreq(data.gpu_clock));
    setBar("gpu-clock-bar", (data.gpu_clock / SCALE_MAX.gpuClock) * 100);
  }
  if (typeof data.gpu_fan === "number") {
    setText("gpu-fan-value", `${Math.round(data.gpu_fan)}%`);
    setBar("gpu-fan-bar", data.gpu_fan);
  }
  if (typeof data.gpu_power === "number") {
    setText("gpu-power-value", `${Math.round(data.gpu_power)} W`);
    setBar("gpu-power-bar", (data.gpu_power / peak("gpu_power", data.gpu_power, data.gpu_power_limit || 300)) * 100);
  }
  if (typeof data.gpu_mem_used_mb === "number" && data.gpu_mem_total_mb) {
    setText("gpu-vram-value", `${formatMem(data.gpu_mem_used_mb)} / ${formatMem(data.gpu_mem_total_mb)}`);
    setBar("gpu-vram-bar", (data.gpu_mem_used_mb / data.gpu_mem_total_mb) * 100);
  }

  if (typeof data.ram_load === "number") {
    setText("ram-value", `${Math.round(data.ram_load)}%`);
    setBar("ram-bar", data.ram_load);
  }
  if (typeof data.ram_used_mb === "number") {
    setText("ram-used", formatMem(data.ram_used_mb));
  }
  if (typeof data.ram_free_mb === "number") {
    setText("ram-free", formatMem(data.ram_free_mb));
  }

  if (typeof data.net_up_kbs === "number") {
    setText("net-up", formatNet(data.net_up_kbs));
  }
  if (typeof data.net_down_kbs === "number") {
    setText("net-down", formatNet(data.net_down_kbs));
  }

  if (data.storage) renderStorage(data.storage);
  updateMiniRings(data);

  applyTempsSample(data);
  applyCardsSample(data);
  applyOsdSample(data);
  applyFps(data.fps);
}

const tauriInvoke = window.__TAURI__?.core?.invoke;

// Samples arrive every 0.25–3 s. A socket silent for longer is dead even if
// the browser never noticed (the adb tunnel can drop without closing it).
const STALE_SOCKET_MS = 8000;
// After this long without data the PC is off, asleep or unplugged.
const HOST_AWAY_MS = 20000;

let socket = null;
let lastDataAt = Date.now();
// Unknown until the first sample (or the away timeout). The Android app keeps
// whatever the previous page told it, and the page reloads by itself when the
// PC restarts, so a fresh page must report the state either way — otherwise
// the phone stayed dimmed after a reboot even with data flowing.
let hostAway = null;

/** Dims the phone and lets its screen turn off while the PC is away (the
 *  Android app exposes `SideDeckApp`; in a browser this is just the overlay). */
function setHostAway(away) {
  hostAway = away;
  document.body.classList.toggle("host-away", away);
  try {
    window.SideDeckApp?.setHostConnected(!away);
  } catch (err) {
    // Older app without the bridge.
  }
}

function connectWebSocket() {
  socket = new WebSocket(WS_URL);
  const current = socket;

  current.onmessage = (event) => {
    lastDataAt = Date.now();
    if (hostAway !== false) setHostAway(false);
    try {
      const data = JSON.parse(event.data);
      applySample(data);
    } catch (err) {
      console.error("Invalid payload from host", err);
    }
  };

  current.onclose = () => {
    if (current === socket) setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
  };

  current.onerror = () => {
    current.close();
  };
}

function watchConnection() {
  setInterval(() => {
    const silent = Date.now() - lastDataAt;
    if (silent > STALE_SOCKET_MS && socket && socket.readyState === WebSocket.OPEN) {
      // close() on a half-open socket can hang waiting for the server, so
      // drop it and open a fresh one right away.
      const dead = socket;
      socket = null;
      dead.onclose = null;
      dead.close();
      connectWebSocket();
    }
    if (silent > HOST_AWAY_MS && hostAway !== true) setHostAway(true);
  }, 2000);
}

/** Inside the Tauri preview an insecure ws:// socket is blocked, so the same
 *  samples are polled over IPC instead. */
function startIpcDataPolling() {
  const poll = async () => {
    try {
      const json = await tauriInvoke("get_sample");
      if (json) applySample(JSON.parse(json));
    } catch (err) {
      console.error("IPC sample failed", err);
    }
  };
  poll();
  setInterval(poll, 1000);
}

function startDataFeed() {
  if (tauriInvoke) {
    startIpcDataPolling();
  } else {
    connectWebSocket();
    watchConnection();
  }
}

function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement.style;
  if (theme.background) root.setProperty("--bg", theme.background);
  if (theme.card_background) root.setProperty("--card-bg", theme.card_background);
  if (theme.text_color) root.setProperty("--text-primary", theme.text_color);
  if (theme.muted_color) root.setProperty("--text-muted", theme.muted_color);
  if (theme.accent_color) root.setProperty("--accent", theme.accent_color);
  if (theme.accent_color_2) root.setProperty("--accent-2", theme.accent_color_2);
  if (typeof theme.font_scale === "number") root.setProperty("--font-scale", theme.font_scale);
  if (typeof theme.density === "number") root.setProperty("--density", theme.density);
  root.setProperty("--font-family", FONT_STACKS[theme.font_family] || SYSTEM_FONT);

  const brandEl = document.getElementById("brand-text");
  if (brandEl) brandEl.textContent = theme.brand_text ?? "SideDeck";
}

function applyDisplay(display) {
  if (!display) return;
  displayConfig = { ...displayConfig, ...display };

  const root = document.documentElement.style;
  if (typeof display.bar_thickness === "number") {
    root.setProperty("--bar-thickness", display.bar_thickness);
  }
  if (typeof display.ring_thickness === "number") {
    root.setProperty("--ring-thickness", display.ring_thickness);
  }
  if (typeof display.icon_scale === "number") {
    root.setProperty("--icon-scale", display.icon_scale);
  }
  if (typeof display.corner_radius === "number") {
    root.setProperty("--radius", `${display.corner_radius}px`);
    document.body.classList.toggle("square-style", display.corner_radius === 0);
  }

  const topbar = document.getElementById("topbar");
  if (topbar) topbar.dataset.clock = display.clock_position || "center";

  const brandEl = document.getElementById("brand-text");
  if (brandEl) brandEl.hidden = display.show_brand === false;

  const cornerEl = document.getElementById("corner-logo");
  if (cornerEl) cornerEl.hidden = display.show_corner_icon !== true;

  const fpsEl = document.getElementById("fps");
  if (fpsEl) fpsEl.hidden = display.show_fps !== true;
  if (typeof display.fps_scale === "number") {
    root.setProperty("--fps-scale", display.fps_scale);
  }

  const clockEl = document.getElementById("clock");
  if (clockEl) clockEl.hidden = display.show_clock === false;
  // Nothing left in the top bar: drop it and give the panel the space.
  if (topbar) {
    topbar.classList.toggle("empty", [brandEl, clockEl, cornerEl, fpsEl].every((el) => !el || el.hidden));
  }

  root.setProperty("--glass-opacity", display.glass_opacity ?? 0.35);

  applyTempsLayout(display);
  const osdPanel = document.getElementById("dashboard-osd");
  if (osdPanel) {
    osdPanel.dataset.align = display.osd_align || "left";
    osdPanel.dataset.valign = display.osd_valign || "top";
    osdFit = 0;
  }
  applyStatRows("card-cpu", display.cpu_stats);
  applyStatRows("card-gpu", display.gpu_stats);
  buildMiniRings(display.mini_sensors || DEFAULT_MINI_SENSORS);

  updateClock();
}

const measureCanvas = document.createElement("canvas").getContext("2d");

/** How much empty space (as a fraction of the font size) the current font
 *  leaves above and below digits in a line-height: 1 box. Exposed as
 *  --trim-top / --trim-bottom so the big temperatures can sit flush against
 *  the screen edge in any font. */
function measureDigitTrim(el) {
  const style = getComputedStyle(el);
  measureCanvas.font = `${style.fontWeight} 100px ${style.fontFamily}`;
  const m = measureCanvas.measureText("0123456789");
  if (typeof m.fontBoundingBoxAscent !== "number") return;

  const lineHeight = 100;
  const baseline = (lineHeight + m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
  const top = baseline - m.actualBoundingBoxAscent;
  const bottom = lineHeight - (baseline + m.actualBoundingBoxDescent);
  el.style.setProperty("--trim-top", Math.max(0, top) / 100);
  el.style.setProperty("--trim-bottom", Math.max(0, bottom) / 100);
}

async function updateTempsTrim() {
  const numbers = document.querySelectorAll(".temps-number");
  if (numbers.length === 0) return;
  const family = getComputedStyle(numbers[0]).fontFamily;
  try {
    await document.fonts.load(`700 100px ${family}`);
  } catch (err) {
    // Measuring the fallback font is still better than nothing.
  }
  numbers.forEach(measureDigitTrim);
}

let lastTrimFont = null;

// More rows than this don't fit next to the ring on a phone screen.
const MAX_CARD_STATS = 4;

/** Shows only the chosen rows of a full-model device card, in the chosen
 *  order. */
function applyStatRows(cardClass, keys) {
  const card = document.querySelector(`.${cardClass}`);
  if (!card || !Array.isArray(keys)) return;
  const shown = keys.slice(0, MAX_CARD_STATS);
  card.querySelectorAll(".stat[data-stat]").forEach((row) => {
    const index = shown.indexOf(row.dataset.stat);
    row.hidden = index === -1;
    row.style.order = String(index);
  });
}

function applyTempsLayout(display) {
  const panel = document.getElementById("dashboard-temps");
  if (!panel) return;
  panel.dataset.layout = display.temps_layout || "row";
  panel.dataset.align = display.temps_align || "left";
  panel.dataset.valign = display.temps_valign || "bottom";
  panel.dataset.order = display.temps_order || "cpu-top";
  panel.dataset.spacing = display.temps_spacing || "together";
  panel.dataset.style = display.temps_style === "rings" ? "rings" : "numbers";
  panel.dataset.caption = display.temps_caption || (display.temps_show_captions === false ? "none" : "above");
  panel.classList.toggle("no-unit", display.temps_show_unit === false);

  const root = document.documentElement.style;
  root.setProperty("--temps-cpu-scale", display.temps_cpu_scale ?? 1);
  root.setProperty("--temps-gpu-scale", display.temps_gpu_scale ?? 1);
  root.setProperty("--temps-margin", display.temps_margin ?? 1);

  const font = getComputedStyle(document.documentElement).getPropertyValue("--font-family");
  if (font !== lastTrimFont) {
    lastTrimFont = font;
    updateTempsTrim();
  }
}

function applyDashboardMode(mode) {
  dashboardMode = mode || "full";

  const panels = {
    full: document.getElementById("dashboard-full"),
    minimal: document.getElementById("dashboard-minimal"),
    temps: document.getElementById("dashboard-temps"),
    glass: document.getElementById("dashboard-glass"),
    amoled: document.getElementById("dashboard-amoled"),
    osd: document.getElementById("dashboard-osd"),
  };

  for (const [name, panel] of Object.entries(panels)) {
    if (panel) panel.hidden = name !== dashboardMode;
  }
  document.body.classList.toggle("model-glass", dashboardMode === "glass");
  document.body.classList.toggle("model-amoled", dashboardMode === "amoled");
  document.body.classList.toggle("model-osd", dashboardMode === "osd");
  layoutMiniGrid();
}


const CARD_SELECTORS = {
  cpu: ".card-cpu",
  gpu: ".card-gpu",
  ram: ".card-ram",
  network: ".card-net",
  storage: ".card-storage",
};

/** Scales each card's content by how much bigger the card is than it would
 *  be in the default layout (a card alone on its row can be twice as big). */
function updateCardZoom() {
  const grid = document.getElementById("dashboard-full");
  if (!grid || grid.hidden) return;
  const area = grid.getBoundingClientRect();
  const style = getComputedStyle(grid);
  const gapX = parseFloat(style.columnGap) || 0;
  const gapY = parseFloat(style.rowGap) || 0;
  const width = area.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = area.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const portrait = innerWidth < innerHeight;
  // Default layout: two big cards over three small ones, 1.4 : 1 in height.
  const reference = portrait
    ? { big: [width, (height - 4 * gapY) / 5], small: [width, (height - 4 * gapY) / 5] }
    : {
        big: [(width - gapX) / 2, ((height - gapY) * 1.4) / 2.4],
        small: [(width - 2 * gapX) / 3, (height - gapY) / 2.4],
      };
  for (const [key, selector] of Object.entries(CARD_SELECTORS)) {
    const el = document.querySelector(selector);
    if (!el || el.style.display === "none") continue;
    const [refW, refH] = reference[key === "cpu" || key === "gpu" ? "big" : "small"];
    const box = el.getBoundingClientRect();
    // Geometric mean: growing in only one direction (taller, same width)
    // scales the content less than growing in both.
    const zoom = Math.sqrt((box.width / refW) * (box.height / refH));
    el.style.setProperty("--zoom", String(Math.max(1, Math.min(2.4, Math.round(zoom * 20) / 20))));
  }
}

/** Hides the cards that are switched off and re-flows the rest so they still
 *  fill the screen: the big CPU/GPU cards share the top row, the small ones
 *  the bottom row, and a row with nothing in it gives its height to the other.
 *  The grid has 12 columns, so 1, 2 and 3 cards per row all divide evenly. */
function applyCardVisibility(cards) {
  const on = (key) => cards[key] !== false;
  for (const [key, selector] of Object.entries(CARD_SELECTORS)) {
    const el = document.querySelector(selector);
    if (el) el.style.display = on(key) ? "" : "none";
  }

  const rows = [["cpu", "gpu"].filter(on), ["ram", "network", "storage"].filter(on)].filter((row) => row.length > 0);
  rows.forEach((row, index) => {
    const span = 12 / row.length;
    row.forEach((key, i) => {
      const el = document.querySelector(CARD_SELECTORS[key]);
      el.style.setProperty("--col", `${1 + i * span} / ${1 + (i + 1) * span}`);
      el.style.setProperty("--row", String(index + 1));
    });
  });

  const grid = document.getElementById("dashboard-full");
  const count = rows.reduce((sum, row) => sum + row.length, 0);
  // Portrait stacks every card in one column.
  grid.style.setProperty("--full-count", String(Math.max(1, count)));
  grid.style.setProperty(
    "--full-rows",
    rows.length === 2 ? "minmax(0, 1.4fr) minmax(0, 1fr)" : "minmax(0, 1fr)"
  );
}

let screensaverIntervalId = null;
let screensaverTimeoutId = null;
let lastScreensaverConfigJson = null;

const IMAGE_FILE = /\.(jpe?g|png|webp|gif)$/i;

/** The gallery holds videos and still images; the file extension tells them
 *  apart. */
function isImageFile(name) {
  return IMAGE_FILE.test(name || "");
}

function resetScreensaverState() {
  document.body.classList.remove("bg-always");
  document.body.classList.remove("screensaver-active");
  if (screensaverIntervalId) {
    clearInterval(screensaverIntervalId);
    screensaverIntervalId = null;
  }
  if (screensaverTimeoutId) {
    clearTimeout(screensaverTimeoutId);
    screensaverTimeoutId = null;
  }
  const video = document.getElementById("screensaver");
  if (video) video.pause();
}

/** Shows the video or the image element, whichever the chosen file is for,
 *  and returns it. */
function pickBackgroundElement(file) {
  const video = document.getElementById("screensaver");
  const image = document.getElementById("screensaver-img");
  const useImage = isImageFile(file);
  video.hidden = useImage;
  image.hidden = !useImage;
  document.body.classList.toggle("bg-image", useImage);
  if (useImage) {
    video.removeAttribute("src");
    video.load();
  } else {
    image.removeAttribute("src");
  }
  return useImage ? image : video;
}

/** The temperature overlay is independent from the video timing, so toggling
 *  it doesn't restart the screensaver cycle. */
function applyScreensaverTemps(config) {
  const overlay = document.getElementById("ss-temps");
  if (!overlay) return;
  overlay.hidden = config.show_temps !== true;
  overlay.dataset.corner = config.temps_corner || "bottom-right";
}

function applyScreensaver(config) {
  applyScreensaverTemps(config);
  document.documentElement.style.setProperty("--video-overlay", config.overlay_opacity ?? 0.35);

  document.documentElement.dataset.fit = config.fit || "auto";
  updateBackdrop(config.video || "aurora.webm");
  document.documentElement.style.setProperty("--bg-fit", backgroundFit(isImageFile(config.video || "aurora.webm")));
  const { show_temps, temps_corner, overlay_opacity, fit, ...videoConfig } = config;
  const json = JSON.stringify(videoConfig);
  if (json === lastScreensaverConfigJson) return;
  lastScreensaverConfigJson = json;

  resetScreensaverState();

  const mode = config.mode || "cycle";
  const videoFile = config.video || "aurora.webm";
  const media = pickBackgroundElement(videoFile);
  const isImage = media.tagName === "IMG";
  media.src = `/assets/videos/${encodeURIComponent(videoFile)}`;
  // The frosted-glass copy has to be redrawn once the picture has loaded.
  media.onload = media.onloadeddata = () => updateGlassEffects();

  if (mode === "off") return;

  let videoAvailable = true;
  media.onerror = () => {
    videoAvailable = false;
  };

  if (mode === "always") {
    document.body.classList.add("bg-always");
    if (!isImage) media.play().catch(() => {});
    return;
  }

  const intervalMs = config.interval_ms || DEFAULT_SCREENSAVER_INTERVAL_MS;
  const durationMs = config.duration_ms || DEFAULT_SCREENSAVER_DURATION_MS;

  screensaverIntervalId = setInterval(() => {
    if (!videoAvailable) return;

    document.body.classList.add("screensaver-active");
    if (!isImage) {
      media.currentTime = 0;
      media.play().catch(() => {});
    }

    screensaverTimeoutId = setTimeout(() => {
      document.body.classList.remove("screensaver-active");
      if (!isImage) media.pause();
    }, durationMs);
  }, intervalMs);
}

async function loadConfig() {
  // In the desktop preview the page is served by Tauri's own asset protocol,
  // so "/config.json" would never reach the HTTP server. The IPC bridge is
  // available there instead.
  if (tauriInvoke) {
    try {
      return await tauriInvoke("get_dashboard_config");
    } catch (err) {
      console.warn("IPC get_settings failed, falling back to HTTP", err);
    }
  }

  try {
    // A request stuck on a dead tunnel must not block the next polls.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(configUrl(), { signal: controller.signal });
    clearTimeout(timer);
    return await response.json();
  } catch (err) {
    // Host unreachable: keep the current look instead of resetting it.
    console.warn("Could not load /config.json", err);
    return null;
  }
}

const CONFIG_POLL_INTERVAL_MS = 4000;

// The settings window opens `/?model=amoled` to preview a model in a browser.
const PREVIEW_MODEL = new URLSearchParams(location.search).get("model");

function configUrl() {
  return PREVIEW_MODEL ? `/config.json?model=${encodeURIComponent(PREVIEW_MODEL)}` : "/config.json";
}

// The only text on the panel that isn't a sensor name.
const AWAY_TEXT = { "pt-BR": "Aguardando o PC", en: "Waiting for the PC" };

function applyLanguage(language) {
  const away = document.querySelector(".host-away-text");
  if (away) away.textContent = AWAY_TEXT[language] || AWAY_TEXT["pt-BR"];
  document.documentElement.lang = language === "en" ? "en" : "pt-BR";
}

// The host's start id from the first config seen by this page.
let loadedServerBuild = null;

async function pollConfig() {
  const config = await loadConfig();
  if (!config) return;
  // The host restarted (possibly updated): reload so the page runs the new
  // HTML/CSS/JS instead of only picking up new settings.
  if (config.server_build) {
    if (loadedServerBuild === null) {
      loadedServerBuild = config.server_build;
    } else if (config.server_build !== loadedServerBuild) {
      location.reload();
      return;
    }
  }
  deviceLabels = { cpu: "", gpu: "", ...(config.labels || {}) };
  applyLanguage(config.language);
  applyTheme(config.theme || {});
  applyDisplay(config.display || {});
  applyDashboardMode(config.dashboard_mode);
  applyCardVisibility(config.cards || {});
  applyScreensaver(config.screensaver || {});
  updateGlassEffects();
  updateCardZoom();
}

window.addEventListener("DOMContentLoaded", async () => {
  updateClock();
  setInterval(updateClock, 1000);
  initMiniRingLengths();
  startDataFeed();

  await pollConfig();
  setInterval(pollConfig, CONFIG_POLL_INTERVAL_MS);
});
