//! Vendor-neutral GPU readings straight from Windows — the same D3DKMT
//! interface Task Manager's GPU tab uses — so AMD, Intel and any other WDDM
//! GPU show up without NVML or Afterburner, and without admin rights.
//!
//! - DXGI picks the adapter to show (the one with the most dedicated VRAM,
//!   which skips Basic Render and indirect adapters like DisplayLink) and
//!   gives its name, PCI ids and VRAM size.
//! - Usage: busy time of each engine (node) between two samples; the busiest
//!   engine wins, like Task Manager.
//! - VRAM in use: bytes resident in the adapter's memory segments.
//! - Temperature and clock: the driver's perf data (WDDM 2.7+ / Windows 10
//!   2004+); older drivers just leave them empty.

use std::ffi::c_void;
use std::time::Instant;
use windows::Wdk::Graphics::Direct3D::{
    D3DKMTCloseAdapter, D3DKMTOpenAdapterFromLuid, D3DKMTQueryAdapterInfo, D3DKMTQueryStatistics,
    D3DKMT_ADAPTER_PERFDATA, D3DKMT_CLOSEADAPTER, D3DKMT_OPENADAPTERFROMLUID,
    D3DKMT_QUERYADAPTERINFO, D3DKMT_QUERYSTATISTICS, D3DKMT_QUERYSTATISTICS_ADAPTER,
    D3DKMT_QUERYSTATISTICS_NODE, D3DKMT_QUERYSTATISTICS_SEGMENT, D3DKMT_QUERYSTATISTICS_TYPE,
    KMTQAITYPE_ADAPTERPERFDATA,
};
use windows::Win32::Foundation::LUID;
use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE};

const MB: f32 = 1024.0 * 1024.0;
const MICROSOFT_VENDOR_ID: u32 = 0x1414;
/// Below this much dedicated VRAM the adapter is an integrated GPU whose real
/// working memory is the shared system RAM (Intel UHD reports 128 MB).
const INTEGRATED_MAX_DEDICATED_MB: f32 = 512.0;

pub const NVIDIA_VENDOR_ID: u32 = 0x10DE;

#[derive(Clone)]
pub struct GpuAdapter {
    pub name: String,
    pub vendor_id: u32,
    pub device_id: u32,
    luid: LUID,
    dedicated_mb: f32,
    shared_mb: f32,
}

impl GpuAdapter {
    fn is_integrated(&self) -> bool {
        self.dedicated_mb < INTEGRATED_MAX_DEDICATED_MB
    }

    /// VRAM size as Task Manager shows it: dedicated memory for a discrete
    /// card, dedicated + shared for an integrated one.
    pub fn mem_total_mb(&self) -> f32 {
        if self.is_integrated() {
            self.dedicated_mb + self.shared_mb
        } else {
            self.dedicated_mb
        }
    }
}

/// The GPU the panel shows: the hardware adapter with the most dedicated
/// VRAM, i.e. the gaming card on a desktop or an Optimus laptop.
pub fn primary_adapter() -> Option<GpuAdapter> {
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }.ok()?;
    let mut best: Option<GpuAdapter> = None;
    for index in 0.. {
        let Ok(adapter) = (unsafe { factory.EnumAdapters1(index) }) else {
            break;
        };
        let Ok(desc) = (unsafe { adapter.GetDesc1() }) else {
            continue;
        };
        if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 || desc.VendorId == MICROSOFT_VENDOR_ID {
            continue;
        }
        let name_len = desc.Description.iter().position(|&c| c == 0).unwrap_or(desc.Description.len());
        let candidate = GpuAdapter {
            name: String::from_utf16_lossy(&desc.Description[..name_len]).trim().to_string(),
            vendor_id: desc.VendorId,
            device_id: desc.DeviceId,
            luid: desc.AdapterLuid,
            dedicated_mb: desc.DedicatedVideoMemory as f32 / MB,
            shared_mb: desc.SharedSystemMemory as f32 / MB,
        };
        if best.as_ref().map_or(true, |b| candidate.dedicated_mb > b.dedicated_mb) {
            best = Some(candidate);
        }
    }
    best
}

#[derive(Default)]
pub struct GpuCounters {
    pub load: Option<f32>,
    pub temp: Option<f32>,
    pub clock: Option<f32>,
    pub mem_used_mb: Option<f32>,
}

/// Samples one adapter; keeps the engines' busy times to diff against.
pub struct GpuMonitor {
    adapter: GpuAdapter,
    last_busy: Option<(Instant, Vec<i64>)>,
}

impl GpuMonitor {
    pub fn new(adapter: GpuAdapter) -> Self {
        Self { adapter, last_busy: None }
    }

    pub fn sample(&mut self) -> GpuCounters {
        let luid = self.adapter.luid;
        let Some(stats) = query_statistics(luid, D3DKMT_QUERYSTATISTICS_ADAPTER, 0) else {
            return GpuCounters::default();
        };
        let info = unsafe { stats.QueryResult.AdapterInformation };

        // RunningTime is the engine's total busy time in 100 ns units. Node 0
        // is the 3D engine, the only one whose clock drivers report.
        let now = Instant::now();
        let mut clock = None;
        let busy: Vec<i64> = (0..info.NodeCount)
            .map(|node| {
                let Some(q) = query_statistics(luid, D3DKMT_QUERYSTATISTICS_NODE, node) else {
                    return 0;
                };
                let node_info = unsafe { q.QueryResult.NodeInformation };
                if node == 0 && node_info.NodePerfData.Frequency > 0 {
                    clock = Some(node_info.NodePerfData.Frequency as f32 / 1_000_000.0);
                }
                node_info.GlobalInformation.RunningTime
            })
            .collect();
        let load = self.last_busy.as_ref().and_then(|(then, previous)| {
            let window = now.duration_since(*then).as_nanos() as f64 / 100.0;
            (window > 0.0 && previous.len() == busy.len()).then(|| {
                busy.iter()
                    .zip(previous)
                    .map(|(current, before)| (current - before).max(0) as f64 / window * 100.0)
                    .fold(0.0, f64::max)
                    .min(100.0) as f32
            })
        });
        self.last_busy = Some((now, busy));

        // Aperture segments are system RAM mapped for the GPU ("shared").
        let (mut dedicated, mut shared) = (0u64, 0u64);
        for segment in 0..info.NbSegments {
            if let Some(q) = query_statistics(luid, D3DKMT_QUERYSTATISTICS_SEGMENT, segment) {
                let segment = unsafe { q.QueryResult.SegmentInformation };
                if segment.Aperture != 0 {
                    shared += segment.BytesResident;
                } else {
                    dedicated += segment.BytesResident;
                }
            }
        }
        let used = if self.adapter.is_integrated() { dedicated + shared } else { dedicated };

        GpuCounters {
            load,
            temp: adapter_temperature(luid),
            clock,
            mem_used_mb: (info.NbSegments > 0).then(|| used as f32 / MB),
        }
    }
}

fn query_statistics(luid: LUID, kind: D3DKMT_QUERYSTATISTICS_TYPE, id: u32) -> Option<D3DKMT_QUERYSTATISTICS> {
    let mut query = D3DKMT_QUERYSTATISTICS { Type: kind, AdapterLuid: luid, ..Default::default() };
    // Node and segment queries both take their index in this same slot.
    query.Anonymous.QueryNode.NodeId = id;
    unsafe { D3DKMTQueryStatistics(&mut query) }.is_ok().then_some(query)
}

/// GPU temperature in °C, when the driver reports it.
fn adapter_temperature(luid: LUID) -> Option<f32> {
    let mut open = D3DKMT_OPENADAPTERFROMLUID { AdapterLuid: luid, hAdapter: 0 };
    if unsafe { D3DKMTOpenAdapterFromLuid(&mut open) }.is_err() {
        return None;
    }
    let mut perf = D3DKMT_ADAPTER_PERFDATA::default();
    let mut query = D3DKMT_QUERYADAPTERINFO {
        hAdapter: open.hAdapter,
        Type: KMTQAITYPE_ADAPTERPERFDATA,
        pPrivateDriverData: &mut perf as *mut _ as *mut c_void,
        PrivateDriverDataSize: std::mem::size_of::<D3DKMT_ADAPTER_PERFDATA>() as u32,
    };
    let ok = unsafe { D3DKMTQueryAdapterInfo(&mut query) }.is_ok();
    unsafe {
        let _ = D3DKMTCloseAdapter(&D3DKMT_CLOSEADAPTER { hAdapter: open.hAdapter });
    }
    // Reported in tenths of a degree; 0 means the driver doesn't expose it.
    let celsius = perf.Temperature as f32 / 10.0;
    (ok && celsius > 0.0 && celsius < 150.0).then_some(celsius)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn print_gpu_counters() {
        let Some(adapter) = primary_adapter() else {
            println!("no hardware adapter");
            return;
        };
        println!(
            "adapter {:?} ven={:04X} dev={:04X} dedicated={:.0} MB shared={:.0} MB total={:.0} MB",
            adapter.name, adapter.vendor_id, adapter.device_id, adapter.dedicated_mb, adapter.shared_mb,
            adapter.mem_total_mb()
        );
        let mut monitor = GpuMonitor::new(adapter);
        for _ in 0..3 {
            let s = monitor.sample();
            println!("load={:?} temp={:?} clock={:?} mem_used_mb={:?}", s.load, s.temp, s.clock, s.mem_used_mb);
            std::thread::sleep(std::time::Duration::from_millis(1000));
        }
    }
}

