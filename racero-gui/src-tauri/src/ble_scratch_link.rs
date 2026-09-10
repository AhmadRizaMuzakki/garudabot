//! Bridge opsional ke Scratch Link lokal (ws://127.0.0.1:20111/scratch/ble).
//!
//! Upload program Bluetooth di produksi memakai WebSocket dari frontend
//! (`src/lib/ble/`); modul Rust ini helper scan/connect jika dipanggil dari Tauri.
//! Filter discover: service UUID saja — di Windows Scratch Link 1.4.x nama device
//! sering "" jadi filter namePrefix gagal.

use std::collections::HashMap;
use std::net::{SocketAddr, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use tungstenite::{Message, WebSocket};

const SCRATCH_LINK_HOST: &str = "127.0.0.1:20111";
const SCRATCH_LINK_URL: &str = "ws://127.0.0.1:20111/scratch/ble";
const SERVICE_UUID: &str = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";

type WsStream = WebSocket<TcpStream>;

struct BleInner {
    ws: Option<WsStream>,
    next_id: u64,
}

#[derive(Clone)]
pub struct ScratchLinkBleState {
    inner: Arc<Mutex<BleInner>>,
}

impl Default for ScratchLinkBleState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(BleInner {
                ws: None,
                next_id: 1,
            })),
        }
    }
}

fn display_name(raw: &Value) -> String {
    if let Some(name) = raw
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return name.to_string();
    }
    "ESP32 BLE".to_string()
}

fn rpc_id(v: &Value) -> Option<u64> {
    v.as_u64()
        .or_else(|| v.as_i64().and_then(|i| if i >= 0 { Some(i as u64) } else { None }))
}

fn open_socket() -> Result<WsStream, String> {
    let addr: SocketAddr = SCRATCH_LINK_HOST
        .parse()
        .map_err(|e| format!("Alamat Scratch Link invalid: {e}"))?;
    let stream = TcpStream::connect_timeout(&addr, Duration::from_secs(3)).map_err(|e| {
        format!(
            "Scratch Link tidak merespons di {SCRATCH_LINK_HOST} ({e}). \
             Pastikan Scratch Link berjalan, Quit lalu buka lagi, kemudian Cari lagi."
        )
    })?;
    let _ = stream.set_nodelay(true);
    let _ = stream.set_read_timeout(Some(Duration::from_millis(250)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let (ws, _) = tungstenite::client::client(SCRATCH_LINK_URL, stream)
        .map_err(|e| format!("Handshake WebSocket Scratch Link gagal: {e}"))?;
    Ok(ws)
}

fn send_rpc(ws: &mut WsStream, id: u64, method: &str, params: Value) -> Result<(), String> {
    let payload = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params
    });
    ws.send(Message::Text(payload.to_string().into()))
        .map_err(|e| format!("Gagal kirim ke Scratch Link: {e}"))
}

fn discover_params() -> Value {
    // Persis filter yang terbukti menemukan Garudabot di Windows Scratch Link.
    json!({
        "filters": [
            { "services": [SERVICE_UUID] }
        ],
        "optionalServices": [SERVICE_UUID]
    })
}

fn ingest_peripheral(devices: &mut HashMap<String, Value>, params: &Value) -> Option<Value> {
    let peripheral_id = params.get("peripheralId").cloned()?;
    if peripheral_id.is_null() {
        return None;
    }
    let key = match &peripheral_id {
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    let device = json!({
        "peripheralId": peripheral_id,
        "name": display_name(params.get("name").unwrap_or(&Value::Null)),
        "rssi": params.get("rssi").cloned().unwrap_or(Value::Null)
    });
    devices.insert(key, device.clone());
    Some(device)
}

fn handle_incoming(
    msg: &Value,
    devices: &mut HashMap<String, Value>,
    app: Option<&AppHandle>,
    want_id: Option<u64>,
) -> Result<bool, String> {
    if let Some(method) = msg.get("method").and_then(|m| m.as_str()) {
        let params = msg.get("params").cloned().unwrap_or(json!({}));
        if method == "didDiscoverPeripheral" || method == "userDidPickPeripheral" {
            if let Some(device) = ingest_peripheral(devices, &params) {
                if let Some(app) = app {
                    let _ = app.emit("ble-peripheral", device);
                }
            }
        } else if method == "characteristicDidChange" {
            if let Some(app) = app {
                let _ = app.emit("ble-notify", params);
            }
        }
        return Ok(false);
    }

    if let Some(want) = want_id {
        if let Some(id) = msg.get("id").and_then(rpc_id) {
            if id == want {
                if let Some(err) = msg.get("error") {
                    let err_msg = err
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("Scratch Link error")
                        .to_string();
                    return Err(err_msg);
                }
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn pump_until_rpc(
    ws: &mut WsStream,
    want_id: u64,
    devices: &mut HashMap<String, Value>,
    app: Option<&AppHandle>,
    overall_timeout: Duration,
) -> Result<(), String> {
    let deadline = Instant::now() + overall_timeout;
    loop {
        if Instant::now() >= deadline {
            return Err("Timeout menunggu respons Scratch Link.".to_string());
        }
        match ws.read() {
            Ok(Message::Text(text)) => {
                let Ok(msg) = serde_json::from_str::<Value>(&text) else {
                    continue;
                };
                if handle_incoming(&msg, devices, app, Some(want_id))? {
                    return Ok(());
                }
            }
            Ok(Message::Close(_)) => return Err("Koneksi Scratch Link tertutup.".to_string()),
            Ok(_) => {}
            Err(tungstenite::Error::Io(ref e))
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => return Err(format!("Scratch Link: {e}")),
        }
    }
}

fn pump_scan_until(
    ws: &mut WsStream,
    devices: &mut HashMap<String, Value>,
    app: &AppHandle,
    max_wait: Duration,
) {
    let start = Instant::now();
    let mut found_at: Option<Instant> = None;
    while start.elapsed() < max_wait {
        if let Some(t) = found_at {
            if t.elapsed() > Duration::from_secs(2) {
                break;
            }
        }
        match ws.read() {
            Ok(Message::Text(text)) => {
                let before = devices.len();
                let Ok(msg) = serde_json::from_str::<Value>(&text) else {
                    continue;
                };
                let _ = handle_incoming(&msg, devices, Some(app), None);
                if devices.len() > before && found_at.is_none() {
                    found_at = Some(Instant::now());
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(ref e))
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => break,
        }
    }
}

fn with_ws_mut<R>(
    state: &ScratchLinkBleState,
    f: impl FnOnce(&mut BleInner) -> Result<R, String>,
) -> Result<R, String> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| "BLE lock gagal.".to_string())?;
    f(&mut guard)
}

fn alloc_id(state: &ScratchLinkBleState) -> Result<u64, String> {
    with_ws_mut(state, |inner| {
        let id = inner.next_id.max(1);
        inner.next_id = id + 1;
        Ok(id)
    })
}

#[tauri::command]
pub async fn ble_link_scan(
    app: AppHandle,
    state: State<'_, ScratchLinkBleState>,
) -> Result<String, String> {
    let app2 = app.clone();
    let state = state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        // Pastikan socket lama ditutup (hindari sesi Scratch Link macet).
        with_ws_mut(&state, |inner| {
            if let Some(mut ws) = inner.ws.take() {
                let _ = ws.close(None);
            }
            Ok(())
        })?;
        std::thread::sleep(Duration::from_millis(800));

        let mut ws = open_socket()?;
        let mut devices: HashMap<String, Value> = HashMap::new();

        let id = alloc_id(&state)?;
        send_rpc(&mut ws, id, "discover", discover_params())?;
        pump_until_rpc(
            &mut ws,
            id,
            &mut devices,
            Some(&app2),
            Duration::from_secs(8),
        )?;

        // Kumpulkan didDiscoverPeripheral (bisa datang setelah ack).
        pump_scan_until(&mut ws, &mut devices, &app2, Duration::from_secs(12));

        let list: Vec<Value> = devices.values().cloned().collect();
        let _ = app2.emit(
            "ble-scan-done",
            json!({ "count": list.len(), "devices": list.clone() }),
        );

        with_ws_mut(&state, |inner| {
            inner.ws = Some(ws);
            Ok(())
        })?;

        Ok(json!({
            "devices": list,
            "ok": true,
            "via": "scratch-link"
        })
        .to_string())
    })
    .await
    .map_err(|e| format!("BLE scan task gagal: {e}"))?
}

#[tauri::command]
pub async fn ble_link_connect(
    app: AppHandle,
    state: State<'_, ScratchLinkBleState>,
    peripheral_id: Value,
) -> Result<String, String> {
    let app2 = app.clone();
    let state = state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let existing = with_ws_mut(&state, |inner| Ok(inner.ws.take()))?;
        let mut ws = match existing {
            Some(ws) => ws,
            None => {
                let mut ws = open_socket()?;
                let id = alloc_id(&state)?;
                send_rpc(&mut ws, id, "discover", discover_params())?;
                let mut devices = HashMap::new();
                pump_until_rpc(&mut ws, id, &mut devices, Some(&app2), Duration::from_secs(8))?;
                pump_scan_until(&mut ws, &mut devices, &app2, Duration::from_secs(4));
                ws
            }
        };

        let id = alloc_id(&state)?;
        send_rpc(
            &mut ws,
            id,
            "connect",
            json!({ "peripheralId": peripheral_id }),
        )?;
        let mut devices = HashMap::new();
        pump_until_rpc(&mut ws, id, &mut devices, Some(&app2), Duration::from_secs(15))?;
        with_ws_mut(&state, |inner| {
            inner.ws = Some(ws);
            Ok(())
        })?;
        Ok("connected".to_string())
    })
    .await
    .map_err(|e| format!("BLE connect task gagal: {e}"))?
}

#[tauri::command]
pub async fn ble_link_start_notifications(
    app: AppHandle,
    state: State<'_, ScratchLinkBleState>,
    service_id: String,
    characteristic_id: String,
) -> Result<String, String> {
    let app2 = app.clone();
    let state = state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut ws = with_ws_mut(&state, |inner| {
            inner
                .ws
                .take()
                .ok_or_else(|| "Sesi BLE belum aktif. Cari lagi dulu.".to_string())
        })?;
        let id = alloc_id(&state)?;
        if send_rpc(
            &mut ws,
            id,
            "startNotifications",
            json!({
                "serviceId": service_id,
                "characteristicId": characteristic_id
            }),
        )
        .is_err()
        {
            with_ws_mut(&state, |inner| {
                inner.ws = Some(ws);
                Ok(())
            })?;
            return Ok("skip".to_string());
        }
        let mut devices = HashMap::new();
        let result = pump_until_rpc(&mut ws, id, &mut devices, Some(&app2), Duration::from_secs(8));
        with_ws_mut(&state, |inner| {
            inner.ws = Some(ws);
            Ok(())
        })?;
        match result {
            Ok(()) => Ok("ok".to_string()),
            Err(_) => Ok("skip".to_string()),
        }
    })
    .await
    .map_err(|e| format!("BLE notify task gagal: {e}"))?
}

#[tauri::command]
pub async fn ble_link_write(
    app: AppHandle,
    state: State<'_, ScratchLinkBleState>,
    service_id: String,
    characteristic_id: String,
    message_base64: String,
    with_response: bool,
) -> Result<String, String> {
    let app2 = app.clone();
    let state = state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut ws = with_ws_mut(&state, |inner| {
            inner
                .ws
                .take()
                .ok_or_else(|| "Sesi BLE belum aktif. Cari lagi dulu.".to_string())
        })?;
        let id = alloc_id(&state)?;
        send_rpc(
            &mut ws,
            id,
            "write",
            json!({
                "serviceId": service_id,
                "characteristicId": characteristic_id,
                "message": message_base64,
                "encoding": "base64",
                "withResponse": with_response
            }),
        )?;
        let mut devices = HashMap::new();
        let timeout = if with_response {
            Duration::from_secs(15)
        } else {
            Duration::from_secs(3)
        };
        let result = pump_until_rpc(&mut ws, id, &mut devices, Some(&app2), timeout);
        with_ws_mut(&state, |inner| {
            inner.ws = Some(ws);
            Ok(())
        })?;
        match result {
            Ok(()) => Ok("ok".to_string()),
            Err(_) if !with_response => Ok("ok".to_string()),
            Err(e) => Err(e),
        }
    })
    .await
    .map_err(|e| format!("BLE write task gagal: {e}"))?
}

#[tauri::command]
pub async fn ble_link_close(state: State<'_, ScratchLinkBleState>) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        with_ws_mut(&state, |inner| {
            if let Some(mut ws) = inner.ws.take() {
                let _ = ws.close(None);
            }
            Ok(())
        })
    })
    .await
    .map_err(|e| format!("BLE close task gagal: {e}"))?
}
