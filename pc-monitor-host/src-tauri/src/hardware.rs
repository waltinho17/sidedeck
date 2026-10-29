use crate::cpu_perf::CpuPerf;
use crate::gpu_windows::{self, GpuAdapter, GpuMonitor, NVIDIA_VENDOR_ID};
use nvml_wrapper::enum_wrappers::device::{Clock, TemperatureSensor};
use nvml_wrapper::Nvml;
use serde::Serialize;
use std::time::Instant;
use sysinfo::{Components, Disks, Networks, System};

use crate::afterburner::{self, source, OsdItem};

#[derive(Serialize, Clone)]
pub struct StorageDrive {
    pub name: String,
    pub percent: u8,
}

#[derive(Serialize, Clone, Default)]
pub struct HardwareSample {
    pub cpu_name: String,
    pub cpu_load: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_temp: Option<f32>,
    pub cpu_clock: f32,
    /// Package power in watts (Afterburner only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_power: Option<f32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_load: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_temp: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_clock: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_fan: Option<f32>,
    /// Board power draw and the driver's enforced limit, in watts.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_power: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_power_limit: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_mem_used_mb: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_mem_total_mb: Option<f32>,

    pub ram_load: f32,
    pub ram_used_mb: f32,
    pub ram_free_mb: f32,

    pub net_up_kbs: f32,
    pub net_down_kbs: f32,

    pub storage: Vec<StorageDrive>,

    /// Frame rate of the running 3D app, via RTSS. Absent when no game is
    /// running or Afterburner isn't monitoring it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frametime: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps_avg: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps_1low: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps_01low: Option<f32>,

    /// The sensors ticked for Afterburner's on-screen display (empty when
    /// Afterburner isn't running), mirrored by the Afterburner model.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub osd: Vec<OsdItem>,
}

/// GPU values from one source; later sources override or fill fields.
#[derive(Default)]
struct GpuReading {
    name: Option<String>,
    load: Option<f32>,
    temp: Option<f32>,
    clock: Option<f32>,
    fan: Option<f32>,
    power: Option<f32>,
    power_limit: Option<f32>,
    mem_used_mb: Option<f32>,
    mem_total_mb: Option<f32>,
}

pub struct HardwareMonitor {
    sys: System,
    disks: Disks,
    networks: Networks,
    components: Components,
    nvml: Option<Nvml>,
    /// The GPU the panel shows, as Windows sees it.
    gpu_adapter: Option<GpuAdapter>,
    /// NVML index of that GPU when it is an NVIDIA card.
    nvml_index: Option<u32>,
    /// Windows' own counters, for any GPU NVML doesn't cover.
    gpu_monitor: Option<GpuMonitor>,
    cpu_perf: Option<CpuPerf>,
    last_sample: Instant,
}

impl HardwareMonitor {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();

        let nvml = match Nvml::init() {
            Ok(nvml) => Some(nvml),
            Err(err) => {
                eprintln!("NVML unavailable (no NVIDIA driver?): {err}");
                None
            }
        };
        let gpu_adapter = gpu_windows::primary_adapter();
        let nvml_index = nvml.as_ref().and_then(|nvml| nvml_device_for(nvml, gpu_adapter.as_ref()));
        let gpu_monitor = match (&gpu_adapter, nvml_index) {
            (Some(adapter), None) => Some(GpuMonitor::new(adapter.clone())),
            _ => None,
        };

        Self {
            sys,
            disks: Disks::new_with_refreshed_list(),
            networks: Networks::new_with_refreshed_list(),
            components: Components::new_with_refreshed_list(),
            nvml,
            gpu_adapter,
            nvml_index,
            gpu_monitor,
            cpu_perf: CpuPerf::new(),
            last_sample: Instant::now(),
        }
    }

    pub fn sample(&mut self) -> HardwareSample {
        let elapsed_secs = self.last_sample.elapsed().as_secs_f32().max(0.001);
        self.last_sample = Instant::now();

        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();
        self.disks.refresh();
        self.networks.refresh();
        self.components.refresh();

        let cpu_name = self
            .sys
            .cpus()
            .first()
            .map(|cpu| cpu.brand().trim().to_string())
            .unwrap_or_default();
        // sysinfo gives the fixed base clock on Windows; scale it by the
        // current performance level to get the real (boosting) clock.
        let base_clock = self
            .sys
            .cpus()
            .first()
            .map(|cpu| cpu.frequency() as f32)
            .unwrap_or(0.0);
        let cpu_clock = self
            .cpu_perf
            .as_mut()
            .and_then(|perf| perf.clock_mhz(base_clock))
            .unwrap_or(base_clock);
        let cpu_load = self.sys.global_cpu_usage();

        // Best-effort fallback for CPU temperature via Windows ACPI thermal
        // zones (rarely populated on AMD systems); overridden below by
        // MSI Afterburner data when available, which is far more reliable.
        let mut cpu_temp = self
            .components
            .iter()
            .find(|c| {
                let label = c.label().to_lowercase();
                label.contains("tctl") || label.contains("cpu package") || label.contains("cpu")
            })
            .map(|c| c.temperature());

        let total_mem = self.sys.total_memory() as f32;
        let used_mem = self.sys.used_memory() as f32;
        let ram_load = if total_mem > 0.0 { used_mem / total_mem * 100.0 } else { 0.0 };
        let ram_used_mb = used_mem / (1024.0 * 1024.0);
        let ram_free_mb = (total_mem - used_mem) / (1024.0 * 1024.0);

        let mut down_bytes: u64 = 0;
        let mut up_bytes: u64 = 0;
        for (_iface, data) in self.networks.iter() {
            down_bytes += data.received();
            up_bytes += data.transmitted();
        }
        let net_down_kbs = (down_bytes as f32 / 1024.0) / elapsed_secs;
        let net_up_kbs = (up_bytes as f32 / 1024.0) / elapsed_secs;

        let storage = self
            .disks
            .iter()
            .map(|disk| {
                let total = disk.total_space();
                let available = disk.available_space();
                let percent = if total > 0 {
                    (((total - available) as f64 / total as f64) * 100.0).round() as u8
                } else {
                    0
                };
                StorageDrive {
                    name: disk.mount_point().to_string_lossy().to_string(),
                    percent,
                }
            })
            .collect();

        // GPU baseline: NVML talks to the NVIDIA driver directly; any other
        // GPU (AMD, Intel...) is read through Windows' own GPU counters, which
        // give usage, temperature, clock and VRAM but not fan or power.
        let mut gpu = match self.sample_gpu_nvml() {
            Some(reading) => reading,
            None => self.sample_gpu_windows(),
        };

        // MSI Afterburner's shared memory carries both CPU and GPU sensors read
        // straight from vendor tools. It is more accurate when present (notably
        // CPU temperature, which Windows doesn't expose on most PCs), but it
        // only publishes the sensors enabled in its monitoring config, so every
        // value here stays optional and falls back to the baseline.
        let mut fps = None;
        // Frametime, average, 1% low, 0.1% low.
        let mut frame_stats = [None; 4];
        let mut osd = Vec::new();
        let mut cpu_power = None;
        if let Some(ab) = afterburner::read() {
            if let Some(temp) = ab.find_exact("CPU temperature") {
                cpu_temp = Some(temp);
            }
            fps = ab.find_exact("Framerate");
            cpu_power = ab.find_exact("CPU power");
            frame_stats = [
                ab.find_exact("Frametime"),
                ab.find_exact("Framerate Avg"),
                ab.find_exact("Framerate 1% Low"),
                ab.find_exact("Framerate 0.1% Low"),
            ];

            // Only trust GPU sensors from the same card the panel shows.
            let index = match &self.gpu_adapter {
                Some(adapter) => ab.gpu_index(adapter.vendor_id, adapter.device_id),
                None => Some(0),
            };
            osd = ab.osd_items(index);
            if let Some(index) = index {
                let value = |id| ab.gpu_value(id, index);
                gpu.load = value(source::GPU_USAGE).or(gpu.load);
                gpu.temp = value(source::GPU_TEMPERATURE).or(gpu.temp);
                gpu.clock = value(source::CORE_CLOCK).or(gpu.clock);
                gpu.fan = value(source::FAN_SPEED).or(gpu.fan);
                gpu.power = gpu.power.or(value(source::GPU_POWER));
                gpu.mem_used_mb = gpu.mem_used_mb.or(value(source::MEMORY_USAGE));
            }
        }
        if let Some(adapter) = &self.gpu_adapter {
            gpu.name = gpu.name.or_else(|| Some(adapter.name.clone()));
            gpu.mem_total_mb = gpu.mem_total_mb.or(Some(adapter.mem_total_mb()));
        }

        HardwareSample {
            cpu_name,
            cpu_load,
            cpu_temp,
            cpu_clock,
            cpu_power,
            gpu_name: gpu.name,
            gpu_load: gpu.load,
            gpu_temp: gpu.temp,
            gpu_clock: gpu.clock,
            gpu_fan: gpu.fan,
            gpu_power: gpu.power,
            gpu_power_limit: gpu.power_limit,
            gpu_mem_used_mb: gpu.mem_used_mb,
            gpu_mem_total_mb: gpu.mem_total_mb,
            ram_load,
            ram_used_mb,
            ram_free_mb,
            net_up_kbs,
            net_down_kbs,
            storage,
            fps,
            frametime: frame_stats[0],
            fps_avg: frame_stats[1],
            fps_1low: frame_stats[2],
            fps_01low: frame_stats[3],
            osd,
        }
    }

    /// None when the panel's GPU isn't an NVIDIA card.
    fn sample_gpu_nvml(&self) -> Option<GpuReading> {
        let device = self.nvml.as_ref()?.device_by_index(self.nvml_index?).ok()?;

        const MB: f32 = 1024.0 * 1024.0;
        let memory = device.memory_info().ok();
        Some(GpuReading {
            name: device.name().ok(),
            load: device.utilization_rates().ok().map(|u| u.gpu as f32),
            temp: device
                .temperature(TemperatureSensor::Gpu)
                .ok()
                .map(|t| t as f32),
            clock: device.clock_info(Clock::Graphics).ok().map(|c| c as f32),
            fan: device.fan_speed(0).ok().map(|f| f as f32),
            // NVML reports milliwatts.
            power: device.power_usage().ok().map(|mw| mw as f32 / 1000.0),
            power_limit: device.enforced_power_limit().ok().map(|mw| mw as f32 / 1000.0),
            mem_used_mb: memory.as_ref().map(|m| m.used as f32 / MB),
            mem_total_mb: memory.as_ref().map(|m| m.total as f32 / MB),
        })
    }

    fn sample_gpu_windows(&mut self) -> GpuReading {
        let Some(monitor) = self.gpu_monitor.as_mut() else {
            return GpuReading::default();
        };
        let counters = monitor.sample();
        GpuReading {
            load: counters.load,
            temp: counters.temp,
            clock: counters.clock,
            mem_used_mb: counters.mem_used_mb,
            ..Default::default()
        }
    }
}

/// NVML index of the panel's GPU, or None when it isn't an NVIDIA card.
/// Without DXGI info, NVML's first GPU is used.
fn nvml_device_for(nvml: &Nvml, adapter: Option<&GpuAdapter>) -> Option<u32> {
    let count = nvml.device_count().ok().filter(|&count| count > 0)?;
    let Some(adapter) = adapter else {
        return Some(0);
    };
    if adapter.vendor_id != NVIDIA_VENDOR_ID {
        return None;
    }
    // NVML packs the PCI ids as device << 16 | vendor.
    let wanted = (adapter.device_id << 16) | NVIDIA_VENDOR_ID;
    (0..count)
        .find(|&index| {
            nvml.device_by_index(index)
                .and_then(|device| device.pci_info())
                .is_ok_and(|pci| pci.pci_device_id == wanted)
        })
        .or(Some(0))
}
