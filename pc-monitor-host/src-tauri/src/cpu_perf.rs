//! Real CPU clock on Windows.
//!
//! sysinfo only reports the base frequency there (a fixed 3501 MHz on a Ryzen
//! 5 5600). Task Manager's "speed" is the base frequency scaled by the
//! "% Processor Performance" counter, which goes above 100% while boosting;
//! this reads the same counter through PDH.

use windows::core::w;
use windows::Win32::System::Performance::{
    PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterValue,
    PdhOpenQueryW, PDH_FMT_COUNTERVALUE, PDH_FMT_DOUBLE,
};

pub struct CpuPerf {
    query: isize,
    counter: isize,
}

// The handles are only used from the sampler thread that owns the monitor.
unsafe impl Send for CpuPerf {}

impl CpuPerf {
    pub fn new() -> Option<Self> {
        unsafe {
            let mut query = 0isize;
            if PdhOpenQueryW(None, 0, &mut query) != 0 {
                return None;
            }
            let mut counter = 0isize;
            // English name, so it works on any Windows language.
            if PdhAddEnglishCounterW(
                query,
                w!("\\Processor Information(_Total)\\% Processor Performance"),
                0,
                &mut counter,
            ) != 0
            {
                PdhCloseQuery(query);
                return None;
            }
            // Rate counters need a first sample to diff against.
            PdhCollectQueryData(query);
            Some(Self { query, counter })
        }
    }

    /// Current clock in MHz, or None until two samples exist.
    pub fn clock_mhz(&mut self, base_mhz: f32) -> Option<f32> {
        unsafe {
            if PdhCollectQueryData(self.query) != 0 {
                return None;
            }
            let mut value = PDH_FMT_COUNTERVALUE::default();
            if PdhGetFormattedCounterValue(self.counter, PDH_FMT_DOUBLE, None, &mut value) != 0 {
                return None;
            }
            let percent = value.Anonymous.doubleValue;
            (percent.is_finite() && percent > 0.0).then(|| base_mhz * percent as f32 / 100.0)
        }
    }
}

impl Drop for CpuPerf {
    fn drop(&mut self) {
        unsafe {
            PdhCloseQuery(self.query);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_boosting_clock() {
        let mut perf = CpuPerf::new().expect("PDH counter unavailable");
        for _ in 0..3 {
            std::thread::sleep(std::time::Duration::from_millis(700));
            println!("clock: {:?}", perf.clock_mhz(3501.0));
        }
        assert!(perf.clock_mhz(3501.0).is_some());
    }
}
