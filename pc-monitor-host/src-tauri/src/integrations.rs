//! Optional link to another PC tool: OpenRGB (colors for the panel palette).

use crate::i18n::tr;
use serde::Serialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

/* ---------------------------------------------------------------- OpenRGB */

const ORGB_ADDR: &str = "127.0.0.1:6742";
const ORGB_TIMEOUT: Duration = Duration::from_millis(1500);
/// Newest protocol revision this client parses (4 added zone segments).
const ORGB_MAX_PROTOCOL: u32 = 3;

const PKT_REQUEST_CONTROLLER_COUNT: u32 = 0;
const PKT_REQUEST_CONTROLLER_DATA: u32 = 1;
const PKT_REQUEST_PROTOCOL_VERSION: u32 = 40;
const PKT_SET_CLIENT_NAME: u32 = 50;

#[derive(Serialize)]
pub struct RgbPalette {
    pub accent: String,
    pub accent_2: String,
    pub devices: usize,
}

fn send(stream: &mut TcpStream, device: u32, id: u32, payload: &[u8]) -> std::io::Result<()> {
    let mut packet = Vec::with_capacity(16 + payload.len());
    packet.extend_from_slice(b"ORGB");
    packet.extend_from_slice(&device.to_le_bytes());
    packet.extend_from_slice(&id.to_le_bytes());
    packet.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    packet.extend_from_slice(payload);
    stream.write_all(&packet)
}

fn receive(stream: &mut TcpStream) -> std::io::Result<Vec<u8>> {
    let mut header = [0u8; 16];
    stream.read_exact(&mut header)?;
    if &header[0..4] != b"ORGB" {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "not an OpenRGB server"));
    }
    let size = u32::from_le_bytes(header[12..16].try_into().unwrap()) as usize;
    if size > 4 * 1024 * 1024 {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "packet too big"));
    }
    let mut body = vec![0u8; size];
    stream.read_exact(&mut body)?;
    Ok(body)
}

struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let end = self.pos.checked_add(n)?;
        let slice = self.buf.get(self.pos..end)?;
        self.pos = end;
        Some(slice)
    }
    fn u16(&mut self) -> Option<u16> {
        Some(u16::from_le_bytes(self.take(2)?.try_into().ok()?))
    }
    fn u32(&mut self) -> Option<u32> {
        Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }
    /// Length-prefixed string (the length counts the trailing NUL).
    fn skip_string(&mut self) -> Option<()> {
        let len = self.u16()? as usize;
        self.take(len).map(|_| ())
    }
}

/// The current color of every LED of one controller, or None if the packet
/// doesn't parse (a protocol revision this client doesn't know).
fn parse_controller_colors(version: u32, data: &[u8]) -> Option<Vec<[u8; 3]>> {
    let mut r = Reader { buf: data, pos: 0 };
    r.u32()?; // data size
    r.u32()?; // device type
    r.skip_string()?; // name
    if version >= 1 {
        r.skip_string()?; // vendor
    }
    for _ in 0..4 {
        r.skip_string()?; // description, version, serial, location
    }
    let modes = r.u16()?;
    r.u32()?; // active mode
    for _ in 0..modes {
        r.skip_string()?; // name
        // value, flags, speed min/max, [brightness min/max], colors min/max,
        // speed, [brightness], direction, color mode
        let numbers = if version >= 3 { 12 } else { 9 };
        r.take(numbers * 4)?;
        let colors = r.u16()? as usize;
        r.take(colors * 4)?;
    }
    let zones = r.u16()?;
    for _ in 0..zones {
        r.skip_string()?;
        r.take(4 * 4)?; // type, leds min/max/count
        let matrix = r.u16()? as usize;
        r.take(matrix)?;
    }
    let leds = r.u16()?;
    for _ in 0..leds {
        r.skip_string()?;
        r.take(4)?;
    }
    let count = r.u16()? as usize;
    let raw = r.take(count * 4)?;
    Some(raw.chunks_exact(4).map(|c| [c[0], c[1], c[2]]).collect())
}

fn rgb_to_hsv([r, g, b]: [u8; 3]) -> (f32, f32, f32) {
    let (r, g, b) = (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let delta = max - min;
    let hue = if delta == 0.0 {
        0.0
    } else if max == r {
        60.0 * (((g - b) / delta) % 6.0)
    } else if max == g {
        60.0 * ((b - r) / delta + 2.0)
    } else {
        60.0 * ((r - g) / delta + 4.0)
    };
    (if hue < 0.0 { hue + 360.0 } else { hue }, if max == 0.0 { 0.0 } else { delta / max }, max)
}

fn hsv_to_hex(h: f32, s: f32, v: f32) -> String {
    let c = v * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = v - c;
    let (r, g, b) = match (h / 60.0) as u32 % 6 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let byte = |n: f32| ((n + m) * 255.0).round().clamp(0.0, 255.0) as u8;
    format!("#{:02x}{:02x}{:02x}", byte(r), byte(g), byte(b))
}

/// The two dominant hues among the lit LEDs, as accent colors. Dark and grey
/// LEDs don't count (an off keyboard shouldn't decide the theme).
fn palette_from_colors(colors: &[[u8; 3]]) -> Option<(String, String)> {
    const BUCKETS: usize = 24;
    // weight, and the weighted sums of hue vectors so averaging wraps around
    let mut buckets = vec![(0.0f32, 0.0f32, 0.0f32); BUCKETS];
    let mut whites = 0usize;
    for &color in colors {
        let (h, s, v) = rgb_to_hsv(color);
        if v < 0.25 {
            continue;
        }
        if s < 0.25 {
            whites += 1;
            continue;
        }
        let bucket = ((h / 360.0) * BUCKETS as f32) as usize % BUCKETS;
        let weight = s * v;
        let radians = h.to_radians();
        buckets[bucket].0 += weight;
        buckets[bucket].1 += radians.cos() * weight;
        buckets[bucket].2 += radians.sin() * weight;
    }

    let hue_of = |b: &(f32, f32, f32)| {
        let h = b.2.atan2(b.1).to_degrees();
        if h < 0.0 { h + 360.0 } else { h }
    };
    let first = (0..BUCKETS).max_by(|&a, &b| buckets[a].0.total_cmp(&buckets[b].0))?;
    if buckets[first].0 == 0.0 {
        return (whites > 0).then(|| ("#e4e4e4".to_string(), "#9a9a9a".to_string()));
    }
    // The second color must be at least 45 degrees away from the first.
    let second = (0..BUCKETS)
        .filter(|&i| {
            let distance = (i as i32 - first as i32).rem_euclid(BUCKETS as i32);
            let distance = distance.min(BUCKETS as i32 - distance);
            distance >= 3 && buckets[i].0 > buckets[first].0 * 0.15
        })
        .max_by(|&a, &b| buckets[a].0.total_cmp(&buckets[b].0));

    let h1 = hue_of(&buckets[first]);
    let accent = hsv_to_hex(h1, 0.9, 1.0);
    let accent_2 = match second {
        Some(i) => hsv_to_hex(hue_of(&buckets[i]), 0.9, 1.0),
        None => accent.clone(),
    };
    Some((accent, accent_2))
}

#[tauri::command]
pub fn get_openrgb_palette() -> Result<RgbPalette, String> {
    let not_running = || {
        tr(
            "Não consegui falar com o OpenRGB. Abra o OpenRGB, vá em SDK Server e clique em Start Server.",
            "Couldn't reach OpenRGB. Open OpenRGB, go to SDK Server and click Start Server.",
        )
        .to_string()
    };
    let addr: SocketAddr = ORGB_ADDR.parse().unwrap();
    let mut stream = TcpStream::connect_timeout(&addr, ORGB_TIMEOUT).map_err(|_| not_running())?;
    stream.set_read_timeout(Some(ORGB_TIMEOUT)).ok();
    stream.set_write_timeout(Some(ORGB_TIMEOUT)).ok();

    let io = |_| not_running();
    send(&mut stream, 0, PKT_SET_CLIENT_NAME, b"SideDeck\0").map_err(io)?;

    // Older servers don't answer the version request: stay on protocol 0.
    send(&mut stream, 0, PKT_REQUEST_PROTOCOL_VERSION, &ORGB_MAX_PROTOCOL.to_le_bytes()).map_err(io)?;
    let version = receive(&mut stream)
        .ok()
        .and_then(|body| body.get(0..4).map(|b| u32::from_le_bytes(b.try_into().unwrap())))
        .unwrap_or(0)
        .min(ORGB_MAX_PROTOCOL);

    send(&mut stream, 0, PKT_REQUEST_CONTROLLER_COUNT, &[]).map_err(io)?;
    let count = receive(&mut stream)
        .map_err(io)?
        .get(0..4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
        .unwrap_or(0);
    if count == 0 {
        return Err(tr("O OpenRGB não encontrou nenhum dispositivo.", "OpenRGB found no devices.").into());
    }

    let mut colors = Vec::new();
    let mut devices = 0;
    for index in 0..count {
        let payload = if version > 0 { version.to_le_bytes().to_vec() } else { Vec::new() };
        send(&mut stream, index, PKT_REQUEST_CONTROLLER_DATA, &payload).map_err(io)?;
        let data = receive(&mut stream).map_err(io)?;
        if let Some(device_colors) = parse_controller_colors(version, &data) {
            devices += 1;
            colors.extend(device_colors);
        }
    }
    if devices == 0 {
        return Err(tr("Não consegui ler as cores do OpenRGB (versão do protocolo não suportada).", "Couldn't read OpenRGB's colors (unsupported protocol version).").into());
    }

    let (accent, accent_2) = palette_from_colors(&colors)
        .ok_or_else(|| tr("Todos os LEDs estão apagados ou escuros no momento.", "All LEDs are off or dark right now.").to_string())?;
    Ok(RgbPalette { accent, accent_2, devices })
}
