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

/* ---------- AIDA64-style model: arc gauges + sparklines ---------- */

const HISTORY_MAX = 60;
const history = {};

/** Arc paths need their length measured once so the dash offset animates
 *  correctly, same trick used for the minimal rings. */
function initArcLengths() {
  const aida = document.getElementById("dashboard-aida");
  const wasHidden = aida && aida.hidden;
  if (aida) aida.hidden = false;

  document.querySelectorAll(".aida-gauge-fill, .aida-big-fill").forEach((el) => {
    const length = el.getTotalLength();
    el.style.strokeDasharray = String(length);
    el.style.strokeDashoffset = String(length);
    el.dataset.length = String(length);
  });

  if (aida && wasHidden) aida.hidden = true;
}

function setArc(id, value, max) {
  const el = document.getElementById(id);
  if (!el) return;
  const length = Number(el.dataset.length) || 0;
  const ratio = Math.max(0, Math.min(1, value / max));
  el.style.strokeDashoffset = length * (1 - ratio);
}

function pushHistory(key, value) {
  if (!history[key]) history[key] = [];
  const series = history[key];
  series.push(value);
  if (series.length > HISTORY_MAX) series.shift();
}

function renderSparkline(id, key, max) {
  const el = document.getElementById(id);
  if (!el) return;
  const series = history[key];
  if (!series || series.length < 2) return;

  const width = 100;
  const height = 40;
  const step = width / (HISTORY_MAX - 1);
  // Right-aligned so the newest sample is always at the right edge.
  const offset = width - (series.length - 1) * step;

  const points = series
    .map((value, i) => {
      const x = offset + i * step;
      const y = height - Math.max(0, Math.min(1, value / max)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  el.setAttribute("points", points);
}

function renderAidaStorage(drives) {
  const container = document.getElementById("aida-storage-list");
  if (!container || !Array.isArray(drives)) return;

  container.innerHTML = "";
  for (const drive of drives) {
    const row = document.createElement("div");
    row.className = "aida-storage-row";
    row.innerHTML = `
      <span class="storage-name">${drive.name}</span>
      <div class="bar"><div class="bar-fill" style="width:${drive.percent}%"></div></div>
      <span class="storage-pct">${drive.percent}%</span>
    `;
    container.appendChild(row);
  }
}

function cpuName(data) {
  return deviceLabels.cpu.trim() || data.cpu_name;
}

function gpuName(data) {
  return deviceLabels.gpu.trim() || data.gpu_name;
}

function applyAidaSample(data) {
  if (data.cpu_name) setText("aida-cpu-name", cpuName(data));
  if (data.gpu_name) setText("aida-gpu-name", gpuName(data));

  if (typeof data.cpu_load === "number") {
    setText("aida-cpu-load", Math.round(data.cpu_load));
    setArc("aida-cpu-load-gauge", data.cpu_load, 100);
  }
  if (typeof data.cpu_temp === "number") {
    setText("aida-cpu-temp", Math.round(data.cpu_temp));
    setArc("aida-cpu-temp-gauge", data.cpu_temp, SCALE_MAX.temp);
    pushHistory("cpu_temp", data.cpu_temp);
    renderSparkline("aida-cpu-temp-line", "cpu_temp", SCALE_MAX.temp);
  }
  if (typeof data.cpu_clock === "number") {
    setText("aida-cpu-clock", formatFreqValue(data.cpu_clock));
    setArc("aida-cpu-clock-gauge", data.cpu_clock, SCALE_MAX.cpuClock);
    pushHistory("cpu_clock", data.cpu_clock);
    renderSparkline("aida-cpu-clock-line", "cpu_clock", SCALE_MAX.cpuClock);
  }

  if (typeof data.gpu_load === "number") {
    setText("aida-gpu-load", Math.round(data.gpu_load));
    setArc("aida-gpu-load-gauge", data.gpu_load, 100);
  }
  if (typeof data.gpu_temp === "number") {
    setText("aida-gpu-temp", Math.round(data.gpu_temp));
    setArc("aida-gpu-temp-gauge", data.gpu_temp, SCALE_MAX.temp);
    pushHistory("gpu_temp", data.gpu_temp);
    renderSparkline("aida-gpu-temp-line", "gpu_temp", SCALE_MAX.temp);
  }
  if (typeof data.gpu_clock === "number") {
    setText("aida-gpu-clock", formatFreqValue(data.gpu_clock));
    setArc("aida-gpu-clock-gauge", data.gpu_clock, SCALE_MAX.gpuClock);
    pushHistory("gpu_clock", data.gpu_clock);
    renderSparkline("aida-gpu-clock-line", "gpu_clock", SCALE_MAX.gpuClock);
  }
  if (typeof data.gpu_fan === "number") {
    setText("aida-gpu-fan", Math.round(data.gpu_fan));
    setArc("aida-gpu-fan-gauge", data.gpu_fan, 100);
    pushHistory("gpu_fan", data.gpu_fan);
    renderSparkline("aida-gpu-fan-line", "gpu_fan", 100);
  }

  if (typeof data.ram_load === "number") {
    setText("aida-ram-pct", `${Math.round(data.ram_load)}%`);
    setArc("aida-ram-gauge", data.ram_load, 100);
    pushHistory("ram_load", data.ram_load);
    renderSparkline("aida-ram-line", "ram_load", 100);
  }

  if (typeof data.net_down_kbs === "number") {
    setText("aida-net-down", decimal(data.net_down_kbs, 1));
    pushHistory("net_down", data.net_down_kbs);
    const max = Math.max(100, ...history.net_down);
    setText("aida-net-down-max", Math.round(max));
    setArc("aida-net-down-gauge", data.net_down_kbs, max);
    renderSparkline("aida-net-down-line", "net_down", max);
  }
  if (typeof data.net_up_kbs === "number") {
    setText("aida-net-up", decimal(data.net_up_kbs, 1));
    pushHistory("net_up", data.net_up_kbs);
    const max = Math.max(100, ...history.net_up);
    setText("aida-net-up-max", Math.round(max));
    setArc("aida-net-up-gauge", data.net_up_kbs, max);
    renderSparkline("aida-net-up-line", "net_up", max);
  }

  if (data.storage) renderAidaStorage(data.storage);
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
function drawFrost() {
  const video = document.getElementById("screensaver");
  const canvas = document.getElementById("glass-frost");
  if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;
  const blur = Math.max(0.1, Number(displayConfig.glass_blur) || 1);
  const w = Math.max(8, Math.round(innerWidth / (4 + 10 * blur)));
  const h = Math.max(4, Math.round((w * innerHeight) / innerWidth));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const scale = Math.max(innerWidth / video.videoWidth, innerHeight / video.videoHeight);
  const sw = innerWidth / scale;
  const sh = innerHeight / scale;
  const ctx = canvas.getContext("2d");
  ctx.filter = "blur(1px)";
  ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, w, h);
  ctx.filter = "none";
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

  glassFrosted = active && videoBehind && (Number(displayConfig.glass_blur) || 0) > 0;
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
  const moving = glassFrosted || (!videoBehind && displayConfig.glass_animated_bg !== false);
  if (moving) glassTimer = setInterval(glassTick, 1000 / (glassFrosted ? FROST_FPS : GLASS_FPS));
}

window.addEventListener("resize", () => {
  if (dashboardMode === "glass") updateGlassEffects();
});

function applyGlassSample(data) {
  if (dashboardMode !== "glass") return;
  if (data.cpu_name) setText("glass-cpu-name", cpuName(data));
  if (data.gpu_name) setText("glass-gpu-name", gpuName(data));

  for (const kind of ["cpu", "gpu"]) {
    const load = data[`${kind}_load`];
    if (typeof load === "number") {
      setText(`glass-${kind}-load`, Math.round(load));
      setGlassRing(`glass-${kind}-ring`, load);
    }
    const temp = data[`${kind}_temp`];
    setText(`glass-${kind}-temp`, typeof temp === "number" ? Math.round(temp) : "--");
    const clock = data[`${kind}_clock`];
    setText(`glass-${kind}-clock`, typeof clock === "number" ? formatFreq(clock) : "--");
    const power = data[`${kind}_power`];
    setText(`glass-${kind}-power`, typeof power === "number" ? `${Math.round(power)} W` : "--");
  }

  if (typeof data.ram_load === "number") {
    setText("glass-ram-load", Math.round(data.ram_load));
    setWidth("glass-ram-bar", data.ram_load);
  }
  if (typeof data.ram_used_mb === "number" && typeof data.ram_free_mb === "number") {
    setText("glass-ram-detail", `${formatMem(data.ram_used_mb)} / ${formatMem(data.ram_used_mb + data.ram_free_mb)}`);
  }
  if (typeof data.gpu_mem_used_mb === "number" && data.gpu_mem_total_mb) {
    const percent = (data.gpu_mem_used_mb / data.gpu_mem_total_mb) * 100;
    setText("glass-vram-load", Math.round(percent));
    setText("glass-vram-detail", `${formatMem(data.gpu_mem_used_mb)} / ${formatMem(data.gpu_mem_total_mb)}`);
    setWidth("glass-vram-bar", percent);
  }
  if (typeof data.net_down_kbs === "number") setText("glass-net-down", formatNet(data.net_down_kbs));
  if (typeof data.net_up_kbs === "number") setText("glass-net-up", formatNet(data.net_up_kbs));

  const drives = document.getElementById("glass-drives");
  if (drives && Array.isArray(data.storage)) {
    drives.innerHTML = data.storage
      .slice(0, 3)
      .map(
        (d) => `<div class="glass-drive"><span>${d.name.replace(/\\$/, "")}</span>` +
          `<div class="glass-bar"><i style="width:${Math.max(0, Math.min(100, d.percent))}%"></i></div>` +
          `<b>${d.percent}%</b></div>`
      )
      .join("");
  }
}

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

  applyAidaSample(data);
  applyTempsSample(data);
  applyGlassSample(data);
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

  // Keep the graph model's clock axis in step with both the real scale and
  // the chosen unit.
  setText("aida-cpu-clock-max", formatFreq(SCALE_MAX.cpuClock));
  setText("aida-gpu-clock-max", formatFreq(SCALE_MAX.gpuClock));

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
    aida: document.getElementById("dashboard-aida"),
    temps: document.getElementById("dashboard-temps"),
    glass: document.getElementById("dashboard-glass"),
  };

  for (const [name, panel] of Object.entries(panels)) {
    if (panel) panel.hidden = name !== dashboardMode;
  }
  document.body.classList.toggle("model-glass", dashboardMode === "glass");
  layoutMiniGrid();
}


function applyCardVisibility(cards) {
  const cardSelectors = {
    cpu: ".card-cpu",
    gpu: ".card-gpu",
    ram: ".card-ram",
    network: ".card-net",
    storage: ".card-storage",
  };

  for (const [key, selector] of Object.entries(cardSelectors)) {
    const el = document.querySelector(selector);
    if (!el) continue;
    el.style.display = cards[key] === false ? "none" : "";
  }
}

let screensaverIntervalId = null;
let screensaverTimeoutId = null;
let lastScreensaverConfigJson = null;

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

  const { show_temps, temps_corner, overlay_opacity, ...videoConfig } = config;
  const json = JSON.stringify(videoConfig);
  if (json === lastScreensaverConfigJson) return;
  lastScreensaverConfigJson = json;

  resetScreensaverState();

  const video = document.getElementById("screensaver");
  if (!video) return;

  const mode = config.mode || "cycle";
  const videoFile = config.video || "aurora.webm";
  video.src = `/assets/videos/${videoFile}`;

  if (mode === "off") return;

  let videoAvailable = true;
  video.onerror = () => {
    videoAvailable = false;
  };

  if (mode === "always") {
    document.body.classList.add("bg-always");
    video.play().catch(() => {});
    return;
  }

  const intervalMs = config.interval_ms || DEFAULT_SCREENSAVER_INTERVAL_MS;
  const durationMs = config.duration_ms || DEFAULT_SCREENSAVER_DURATION_MS;

  screensaverIntervalId = setInterval(() => {
    if (!videoAvailable) return;

    document.body.classList.add("screensaver-active");
    video.currentTime = 0;
    video.play().catch(() => {});

    screensaverTimeoutId = setTimeout(() => {
      document.body.classList.remove("screensaver-active");
      video.pause();
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

// The settings window opens `/?model=aida` to preview a model in a browser.
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
}

window.addEventListener("DOMContentLoaded", async () => {
  updateClock();
  setInterval(updateClock, 1000);
  initMiniRingLengths();
  initArcLengths();
  startDataFeed();

  await pollConfig();
  setInterval(pollConfig, CONFIG_POLL_INTERVAL_MS);
});
