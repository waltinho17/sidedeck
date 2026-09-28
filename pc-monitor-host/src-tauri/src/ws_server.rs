use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;
use tokio_tungstenite::tungstenite::Message;

use crate::hardware::HardwareMonitor;
use crate::paths;
use crate::settings::{AppState, CardsEnabled};

/// Maps a request path to the file on disk. Videos come from the user's
/// gallery folder; everything else from the dashboard's web root.
fn route(path: &str) -> Option<(PathBuf, &'static str)> {
    let web = paths::web_root();
    match path {
        "/" | "/index.html" => Some((web.join("index.html"), "text/html; charset=utf-8")),
        "/styles.css" => Some((web.join("styles.css"), "text/css; charset=utf-8")),
        "/main.js" => Some((web.join("main.js"), "application/javascript; charset=utf-8")),
        "/fonts.css" => Some((web.join("fonts.css"), "text/css; charset=utf-8")),
        _ if path.starts_with("/assets/") => {
            let relative = path.trim_start_matches('/');
            // No way out of the served folders.
            if relative.contains("..") || relative.contains('\\') {
                return None;
            }
            let content_type = match relative.rsplit('.').next() {
                Some("webm") => "video/webm",
                Some("mp4") => "video/mp4",
                Some("png") => "image/png",
                Some("svg") => "image/svg+xml",
                Some("jpg") | Some("jpeg") => "image/jpeg",
                Some("woff2") => "font/woff2",
                Some("woff") => "font/woff",
                Some("ttf") => "font/ttf",
                _ => "application/octet-stream",
            };
            let full = match relative.strip_prefix("assets/videos/") {
                Some(video) => paths::videos_dir().join(video),
                None => web.join(relative),
            };
            Some((full, content_type))
        }
        _ => None,
    }
}

fn apply_card_filter(value: &mut Value, cards: &CardsEnabled) {
    let Value::Object(map) = value else { return };

    if !cards.cpu {
        for key in ["cpu_name", "cpu_load", "cpu_temp", "cpu_clock", "cpu_power"] {
            map.remove(key);
        }
    }
    if !cards.gpu {
        for key in [
            "gpu_name",
            "gpu_load",
            "gpu_temp",
            "gpu_clock",
            "gpu_fan",
            "gpu_power",
            "gpu_power_limit",
            "gpu_mem_used_mb",
            "gpu_mem_total_mb",
        ] {
            map.remove(key);
        }
    }
    if !cards.ram {
        for key in ["ram_load", "ram_used_mb", "ram_free_mb"] {
            map.remove(key);
        }
    }
    if !cards.network {
        for key in ["net_up_kbs", "net_down_kbs"] {
            map.remove(key);
        }
    }
    if !cards.storage {
        map.remove("storage");
    }
}

async fn write_response(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    // Videos are big and never change under the same name; everything else
    // (page, scripts, config) must always be fetched fresh or the phone's
    // WebView keeps running an old version after an update.
    let cache = if content_type.starts_with("video/") {
        "max-age=3600"
    } else {
        "no-cache, no-store, must-revalidate"
    };
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: {cache}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes()).await;
    let _ = stream.write_all(body).await;
}

async fn handle_http(mut stream: TcpStream, state: Arc<AppState>) {
    let mut reader = BufReader::new(&mut stream);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).await.unwrap_or(0) == 0 {
        return;
    }

    loop {
        let mut line = String::new();
        match reader.read_line(&mut line).await {
            Ok(0) => break,
            Ok(_) if line == "\r\n" || line == "\n" => break,
            Ok(_) => continue,
            Err(_) => return,
        }
    }

    let target = request_line.split_whitespace().nth(1).unwrap_or("/");
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let path = path.to_string();

    if path == "/config.json" {
        // `?model=aida`: the settings window previewing a model in a browser.
        // The phone itself may be showing a model for a few seconds.
        let preview = query
            .split('&')
            .find_map(|pair| pair.strip_prefix("model="))
            .map(str::to_string)
            .or_else(|| state.phone_preview());
        let settings = state.get_settings();
        let body = serde_json::to_vec(&settings.resolved_for(preview.as_deref())).unwrap_or_default();
        write_response(&mut stream, "200 OK", "application/json", &body).await;
        return;
    }

    if path == "/api/videos" {
        let videos_dir = paths::videos_dir();
        let mut names: Vec<String> = Vec::new();
        if let Ok(mut entries) = tokio::fs::read_dir(&videos_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Some(name) = entry.file_name().to_str() {
                    names.push(name.to_string());
                }
            }
        }
        names.sort();
        let body = serde_json::to_vec(&names).unwrap_or_default();
        write_response(&mut stream, "200 OK", "application/json", &body).await;
        return;
    }

    match route(&path) {
        Some((full_path, content_type)) => {
            match tokio::fs::read(&full_path).await {
                Ok(contents) => write_response(&mut stream, "200 OK", content_type, &contents).await,
                Err(_) => write_response(&mut stream, "404 Not Found", "text/plain", b"Not Found").await,
            }
        }
        None => write_response(&mut stream, "404 Not Found", "text/plain", b"Not Found").await,
    }
}

async fn handle_ws(stream: TcpStream, mut rx: watch::Receiver<String>) {
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(_) => return,
    };

    let (mut writer, mut reader) = ws_stream.split();

    {
        let payload = rx.borrow().clone();
        if !payload.is_empty() && writer.send(Message::Text(payload)).await.is_err() {
            return;
        }
    }

    loop {
        tokio::select! {
            changed = rx.changed() => {
                if changed.is_err() {
                    break;
                }
                let payload = rx.borrow().clone();
                if payload.is_empty() {
                    continue;
                }
                if writer.send(Message::Text(payload)).await.is_err() {
                    break;
                }
            }
            msg = reader.next() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }
}

async fn handle_connection(stream: TcpStream, rx: watch::Receiver<String>, state: Arc<AppState>) {
    let mut peek_buf = [0u8; 2048];
    let n = match stream.peek(&mut peek_buf).await {
        Ok(n) => n,
        Err(_) => return,
    };
    let head = String::from_utf8_lossy(&peek_buf[..n]).to_lowercase();

    if head.contains("upgrade: websocket") {
        handle_ws(stream, rx).await;
    } else {
        handle_http(stream, state).await;
    }
}

pub async fn run(state: Arc<AppState>) {
    let (tx, rx) = watch::channel(String::new());

    let sampler_state = state.clone();
    std::thread::spawn(move || {
        let mut monitor = HardwareMonitor::new();
        loop {
            let settings = sampler_state.get_settings();
            let sample = monitor.sample();
            if let Ok(mut json) = serde_json::to_value(&sample) {
                apply_card_filter(&mut json, &settings.cards);
                if let Ok(text) = serde_json::to_string(&json) {
                    sampler_state.set_latest_sample(text.clone());
                    let _ = tx.send(text);
                }
            }
            std::thread::sleep(Duration::from_millis(settings.update_interval_ms.max(200)));
        }
    });

    let listener = TcpListener::bind("127.0.0.1:8080")
        .await
        .expect("failed to bind server on port 8080");

    while let Ok((stream, _)) = listener.accept().await {
        tokio::spawn(handle_connection(stream, rx.clone(), state.clone()));
    }
}
