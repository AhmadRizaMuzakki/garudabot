use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{ShellExt, process::CommandEvent};

use crate::app::state::AppState;

pub(crate) fn normalize_port_entry(port: &serde_json::Value) -> serde_json::Value {
    let address = port["address"].as_str().unwrap_or("").to_string();
    let label = port["label"]
        .as_str()
        .or(port["protocol_label"].as_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(address.as_str())
        .to_string();

    serde_json::json!({
        "address": address,
        "label": label,
        "protocol": port["protocol"].as_str().unwrap_or("")
    })
}

/// Ambil objek JSON lengkap berurutan dari stream (arduino-cli --watch bisa
/// mengirim beberapa event dalam satu chunk stdout).
pub(crate) fn take_json_objects(buffer: &mut String) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    loop {
        let start = match buffer.find('{') {
            Some(i) => i,
            None => {
                buffer.clear();
                break;
            }
        };
        if start > 0 {
            buffer.drain(..start);
        }

        let mut depth = 0i32;
        let mut end = None;
        let mut in_string = false;
        let mut escape = false;
        for (idx, ch) in buffer.char_indices() {
            if in_string {
                if escape {
                    escape = false;
                } else if ch == '\\' {
                    escape = true;
                } else if ch == '"' {
                    in_string = false;
                }
                continue;
            }
            match ch {
                '"' => in_string = true,
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(idx + ch.len_utf8());
                        break;
                    }
                }
                _ => {}
            }
        }

        let Some(end) = end else {
            break;
        };
        let chunk: String = buffer.drain(..end).collect();
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&chunk) {
            out.push(value);
        }
    }
    out
}

pub(crate) fn merge_port_into_list(ports: &mut Vec<serde_json::Value>, port: serde_json::Value) {
    let address = port["address"].as_str().unwrap_or("").to_string();
    if address.is_empty() {
        return;
    }
    if let Some(existing) = ports.iter_mut().find(|p| p["address"] == address) {
        *existing = port;
    } else {
        ports.push(port);
    }
}

pub(crate) fn add_missing_ports(ports: &mut Vec<serde_json::Value>, extras: Vec<serde_json::Value>) {
    for port in extras {
        let address = port["address"].as_str().unwrap_or("");
        if address.is_empty() {
            continue;
        }
        if !ports.iter().any(|p| p["address"] == address) {
            ports.push(port);
        }
    }
}

pub(crate) fn ports_from_serialport_crate() -> Vec<serde_json::Value> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| {
            let label = match &p.port_type {
                serialport::SerialPortType::UsbPort(info) => {
                    let product = info.product.clone().unwrap_or_default();
                    if product.is_empty() {
                        p.port_name.clone()
                    } else {
                        format!("{} ({})", p.port_name, product)
                    }
                }
                _ => p.port_name.clone(),
            };
            serde_json::json!({
                "address": p.port_name,
                "label": label,
                "protocol": "serial"
            })
        })
        .collect()
}

/// arduino-cli modern: `{ "detected_ports": [ { "port": { "address": ... } } ] }`
/// legacy / normalisasi kita: `{ "ports": [ { "address": ... } ] }`
pub(crate) fn ports_from_cli_json(parsed: &serde_json::Value) -> Vec<serde_json::Value> {
    let nested = parsed["detected_ports"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    if !nested.is_empty() {
        return nested
            .iter()
            .map(|entry| {
                if entry.get("port").is_some() {
                    normalize_port_entry(&entry["port"])
                } else {
                    normalize_port_entry(entry)
                }
            })
            .filter(|port| !port["address"].as_str().unwrap_or("").is_empty())
            .collect();
    }
    parsed["ports"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(normalize_port_entry)
        .filter(|port| !port["address"].as_str().unwrap_or("").is_empty())
        .collect()
}

pub(crate) async fn fetch_arduino_cli_ports(app: &AppHandle) -> Vec<serde_json::Value> {
    let Ok(sidecar) = app.shell().sidecar("arduino-cli") else {
        return Vec::new();
    };
    let Ok(result) = sidecar
        .args(["board", "list", "--format", "json"])
        .output()
        .await
    else {
        return Vec::new();
    };
    let parsed: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&result.stdout))
            .unwrap_or(serde_json::json!({}));
    ports_from_cli_json(&parsed)
}

pub(crate) fn publish_detected_ports(app: &AppHandle, ports: &[serde_json::Value]) {
    let payload = serde_json::json!({ "detected_ports": ports });
    let _ = app.emit("ports-updated", payload.to_string());
}

fn port_list_signature(ports: &[serde_json::Value]) -> String {
    let mut addrs: Vec<&str> = ports
        .iter()
        .filter_map(|p| p["address"].as_str())
        .collect();
    addrs.sort_unstable();
    addrs.join("|")
}

fn publish_if_changed(
    app: &AppHandle,
    state: &AppState,
    ports: Vec<serde_json::Value>,
    last_sig: &mut String,
) {
    let sig = port_list_signature(&ports);
    if sig == *last_sig {
        return;
    }
    *last_sig = sig;
    *state.detected_ports.lock().unwrap() = ports.clone();
    publish_detected_ports(app, &ports);
}

#[tauri::command]
pub async fn port_list(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    // Selalu refresh dari OS/arduino-cli — jangan andalkan cache watcher saja
    // (parser --watch bisa rusak jika beberapa event COM datang sekali flush).
    let mut ports = fetch_arduino_cli_ports(&app).await;
    if ports.is_empty() {
        ports = ports_from_serialport_crate();
    } else {
        add_missing_ports(&mut ports, ports_from_serialport_crate());
    }

    {
        let mut cached = state.detected_ports.lock().unwrap();
        *cached = ports.clone();
    }
    publish_detected_ports(&app, &ports);

    Ok(serde_json::json!({ "detected_ports": ports }).to_string())
}


/// Seed daftar port + jalankan arduino-cli board list --watch.
/// Event add/remove di-debounce: USB CDC ESP32 sering hilang <1s lalu muncul lagi
/// — kalau langsung di-UI, daftar COM kelihatan "putus-nyambung".
pub(crate) fn spawn_port_watcher(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let initial = fetch_arduino_cli_ports(&app_handle).await;
        let initial = if initial.is_empty() {
            ports_from_serialport_crate()
        } else {
            let mut merged = initial;
            add_missing_ports(&mut merged, ports_from_serialport_crate());
            merged
        };
        let mut last_sig = port_list_signature(&initial);
        {
            let state = app_handle.state::<AppState>();
            *state.detected_ports.lock().unwrap() = initial.clone();
        }
        publish_detected_ports(&app_handle, &initial);

        let (mut rx, child) = match app_handle
            .shell()
            .sidecar("arduino-cli")
            .and_then(|cmd| {
                cmd.args(["board", "list", "--watch", "--format", "json"])
                    .spawn()
            }) {
            Ok(pair) => pair,
            Err(e) => {
                log::warn!("arduino-cli board list --watch gagal: {e}");
                return;
            }
        };

        {
            let state = app_handle.state::<AppState>();
            *state.watcher_child.lock().unwrap() = Some(child);
        }

        let mut json_buffer = String::new();
        let mut dirty = false;
        let debounce = tokio::time::Duration::from_millis(2000);

        loop {
            tokio::select! {
                event = rx.recv() => {
                    let Some(event) = event else { break; };
                    if let CommandEvent::Stdout(line_bytes) = event {
                        let chunk = String::from_utf8_lossy(&line_bytes);
                        json_buffer.push_str(&chunk);
                        // Buang event mentah — cukup tandai dirty; refresh penuh setelah tenang.
                        let events = take_json_objects(&mut json_buffer);
                        if events.iter().any(|d| {
                            matches!(d["eventType"].as_str(), Some("add") | Some("remove"))
                        }) {
                            dirty = true;
                        }
                    }
                }
                _ = tokio::time::sleep(debounce), if dirty => {
                    dirty = false;
                    let mut ports = fetch_arduino_cli_ports(&app_handle).await;
                    if ports.is_empty() {
                        ports = ports_from_serialport_crate();
                    } else {
                        add_missing_ports(&mut ports, ports_from_serialport_crate());
                    }
                    let state = app_handle.state::<AppState>();
                    publish_if_changed(&app_handle, &state, ports, &mut last_sig);
                }
            }
        }
    });
}
