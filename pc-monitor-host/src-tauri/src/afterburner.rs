//! Reads MSI Afterburner's "MAHM" shared memory segment (also used by RTSS OSD
//! and many third-party monitoring tools).
//!
//! Layout (empirically confirmed against a live Afterburner 4.x instance):
//! - Header: dwSignature, dwVersion, dwHeaderSize, dwNumEntries, dwEntrySize,
//!   dwTime, dwNumGpuEntries, dwGpuEntrySize (32 bytes total).
//! - Each entry is `dwEntrySize` bytes. The name is a null-terminated string
//!   at offset 0. The last 24 bytes of every entry are a fixed tail:
//!   `data: f32, minLimit: f32, maxLimit: f32, flags: u32, gpu: i32, srcId: u32`.
//!   Everything between the name and that tail (localized name/units/format
//!   strings) varies by version, so the tail offset is computed as
//!   `entry_size - 24` instead of being hardcoded — this keeps working even
//!   if Afterburner changes the middle section in a future release.
//! - After the entries come `dwNumGpuEntries` GPU descriptors of
//!   `dwGpuEntrySize` bytes; the first string is the PCI id
//!   ("VEN_10DE&DEV_2488&SUBSYS_..."), used to tell GPUs apart.
//!
//! GPU sensors are looked up by source id + GPU index, not by name: with two
//! GPUs Afterburner renames them "GPU1 temperature", "GPU2 temperature"...

use serde::Serialize;
use std::ffi::CStr;
use windows::core::PCWSTR;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Memory::{MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, FILE_MAP_READ};

const MAHM_SIGNATURE: u32 = 0x4D41484D; // 'MAHM'
const SHARED_MEMORY_NAME: &str = "MAHMSharedMemory";
const ENTRY_TAIL_SIZE: usize = 24; // data, minLimit, maxLimit, flags, gpu, srcId
const STRING_SIZE: usize = 260; // MAX_PATH

/// Afterburner's MONITORING_SOURCE_ID_* values for the GPU sensors we use.
pub mod source {
    pub const GPU_TEMPERATURE: u32 = 0x00;
    pub const FAN_SPEED: u32 = 0x10;
    pub const CORE_CLOCK: u32 = 0x20;
    pub const GPU_USAGE: u32 = 0x30;
    /// Dedicated VRAM in use, MB.
    pub const MEMORY_USAGE: u32 = 0x31;
    /// Board power in watts (0x60 is the same in % of TDP).
    pub const GPU_POWER: u32 = 0x61;
}

#[repr(C)]
#[derive(Clone, Copy)]
struct MahmHeader {
    signature: u32,
    _version: u32,
    header_size: u32,
    num_entries: u32,
    entry_size: u32,
    _time: u32,
    num_gpu_entries: u32,
    gpu_entry_size: u32,
}

#[derive(Debug, Clone)]
pub struct AfterburnerEntry {
    pub name: String,
    pub value: f32,
    /// GPU index for GPU sensors (core index for per-core CPU ones, -1 for
    /// totals like "CPU temperature").
    pub gpu: i32,
    pub source: u32,
    /// Unit label ("°C", "MHz", "FPS"...).
    pub units: String,
    /// MAHM_SHARED_MEMORY_ENTRY_FLAG_*: bit 0 = shown in the on-screen display.
    pub flags: u32,
}

pub struct AfterburnerData {
    pub entries: Vec<AfterburnerEntry>,
    /// PCI id of each GPU, in GPU index order.
    pub gpu_ids: Vec<String>,
}

impl AfterburnerData {
    /// Index of the GPU with these PCI ids, or None if Afterburner doesn't
    /// monitor it. Old layouts without GPU descriptors assume GPU 0.
    pub fn gpu_index(&self, vendor_id: u32, device_id: u32) -> Option<i32> {
        if self.gpu_ids.is_empty() {
            return Some(0);
        }
        let wanted = format!("VEN_{vendor_id:04X}&DEV_{device_id:04X}");
        self.gpu_ids
            .iter()
            .position(|id| id.to_ascii_uppercase().contains(&wanted))
            .map(|index| index as i32)
    }

    /// The sensors ticked for Afterburner's on-screen display, in its order.
    /// GPU sensors are limited to `gpu` so a second card doesn't double the lines.
    pub fn osd_items(&self, gpu: Option<i32>) -> Vec<OsdItem> {
        self.entries
            .iter()
            .filter(|entry| entry.flags & 1 != 0)
            .filter(|entry| !(entry.gpu >= 0 && entry.source < 0x80 && gpu.is_some_and(|g| g != entry.gpu)))
            .map(|entry| OsdItem {
                name: entry.name.clone(),
                value: Some(entry.value).filter(|v| is_valid(*v)),
                units: entry.units.clone(),
                source: entry.source,
            })
            .collect()
    }

    pub fn gpu_value(&self, source: u32, gpu: i32) -> Option<f32> {
        self.entries
            .iter()
            .find(|entry| entry.source == source && entry.gpu == gpu)
            .map(|entry| entry.value)
            .filter(|value| is_valid(*value))
    }

    /// Exact (case-insensitive) name match, for sensors whose name is a
    /// prefix of others ("Framerate" vs "Framerate avg", "Framerate 1% low"...).
    pub fn find_exact(&self, name: &str) -> Option<f32> {
        self.entries
            .iter()
            .find(|entry| entry.name.eq_ignore_ascii_case(name))
            .map(|entry| entry.value)
            .filter(|value| is_valid(*value))
    }
}

/// Afterburner reports FLT_MAX for a sensor with no data (e.g. framerate with
/// no 3D app running), so anything non-finite or absurd is treated as missing.
fn is_valid(value: f32) -> bool {
    value.is_finite() && value >= 0.0 && value < 1_000_000.0
}

fn wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Null-terminated string of at most `max` bytes.
unsafe fn read_str(ptr: *const u8, max: usize) -> String {
    CStr::from_bytes_until_nul(std::slice::from_raw_parts(ptr, max))
        .ok()
        .and_then(|c| c.to_str().ok())
        .unwrap_or("")
        .to_string()
}

/// Like `read_str` for text in the ANSI code page: Afterburner writes the
/// degree sign as a single 0xB0 byte, which isn't valid UTF-8.
unsafe fn read_latin1(ptr: *const u8, max: usize) -> String {
    let bytes = std::slice::from_raw_parts(ptr, max);
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(max);
    bytes[..end].iter().map(|&b| b as char).collect()
}

/// One sensor Afterburner shows in its on-screen display, as the dashboard's
/// "Afterburner" model draws it. `value` is None while the sensor has no
/// data (framerate with no game running).
#[derive(Serialize, Clone)]
pub struct OsdItem {
    pub name: String,
    pub value: Option<f32>,
    pub units: String,
    pub source: u32,
}

pub fn read() -> Option<AfterburnerData> {
    unsafe {
        let name = wide_null(SHARED_MEMORY_NAME);
        let handle = OpenFileMappingW(FILE_MAP_READ.0, false, PCWSTR(name.as_ptr())).ok()?;
        let view = MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 0);
        if view.Value.is_null() {
            let _ = CloseHandle(handle);
            return None;
        }

        let base = view.Value as *const u8;
        let header = *(base as *const MahmHeader);

        if header.signature != MAHM_SIGNATURE
            || header.entry_size as usize <= ENTRY_TAIL_SIZE
        {
            let _ = UnmapViewOfFile(view);
            let _ = CloseHandle(handle);
            return None;
        }

        let entry_size = header.entry_size as usize;
        let data_offset = entry_size - ENTRY_TAIL_SIZE;
        let entries_ptr = base.add(header.header_size as usize);

        let mut entries = Vec::with_capacity(header.num_entries as usize);
        for i in 0..header.num_entries as usize {
            let entry_ptr = entries_ptr.add(i * entry_size);
            let name = read_str(entry_ptr, STRING_SIZE.min(entry_size));

            if name.is_empty() {
                continue;
            }

            let units = if entry_size >= 2 * STRING_SIZE { read_latin1(entry_ptr.add(STRING_SIZE), STRING_SIZE) } else { String::new() };
            let tail = entry_ptr.add(data_offset);
            let flags = (tail.add(12) as *const u32).read_unaligned();
            let value = (tail as *const f32).read_unaligned();
            let gpu = (tail.add(16) as *const i32).read_unaligned();
            let source = (tail.add(20) as *const u32).read_unaligned();

            entries.push(AfterburnerEntry { name, value, gpu, source, units, flags });
        }

        let gpus_ptr = entries_ptr.add(header.num_entries as usize * entry_size);
        let gpu_entry_size = header.gpu_entry_size as usize;
        let gpu_ids = if gpu_entry_size >= STRING_SIZE {
            (0..header.num_gpu_entries as usize)
                .map(|i| read_str(gpus_ptr.add(i * gpu_entry_size), STRING_SIZE))
                .collect()
        } else {
            Vec::new()
        };

        let _ = UnmapViewOfFile(view);
        let _ = CloseHandle(handle);

        Some(AfterburnerData { entries, gpu_ids })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn print_afterburner_entries() {
        match read() {
            Some(data) => {
                println!("Found {} entries:", data.entries.len());
                for entry in &data.entries {
                    println!("  {:?} = {} {:?} (gpu {}, source {:#x}, flags {:#x})", entry.name, entry.value, entry.units, entry.gpu, entry.source, entry.flags);
                }
                println!("GPUs: {:?}", data.gpu_ids);

                let cpu_temp = data.find_exact("CPU temperature");
                let gpu_temp = data.gpu_value(source::GPU_TEMPERATURE, 0);
                println!("cpu_temp={cpu_temp:?} gpu_temp={gpu_temp:?}");
            }
            None => println!("MAHM shared memory not available"),
        }
    }
}
