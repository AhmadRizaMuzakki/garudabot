//! BLE native (btleplug) — Connect / OTA / Live Mode tanpa Scratch Link.
//! Jangan pegang Mutex selama scan/connect/write yang lama.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use btleplug::api::{
    Central, Characteristic, Manager as _, Peripheral as _, ScanFilter, WriteType,
};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::StreamExt;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use uuid::Uuid;

const SERVICE_UUID: Uuid = Uuid::from_u128(0x6e400001_b5a3_f393_e0a9_e50e24dcca9e);
const RX_UUID: Uuid = Uuid::from_u128(0x6e400002_b5a3_f393_e0a9_e50e24dcca9e);
const TX_UUID: Uuid = Uuid::from_u128(0x6e400003_b5a3_f393_e0a9_e50e24dcca9e);

const EVENT_PERIPHERAL: &str = "ble-native-peripheral";
const EVENT_NOTIFY: &str = "ble-native-notify";

pub struct NativeBleInner {
    adapter: Option<Adapter>,
    seen: HashMap<String, Peripheral>,
    connected: Option<Peripheral>,
    rx_char: Option<Characteristic>,
    tx_char: Option<Characteristic>,
    notify_task: Option<tokio::task::JoinHandle<()>>,
}

impl Default for NativeBleInner {
    fn default() -> Self {
        Self {
            adapter: None,
            seen: HashMap::new(),
            connected: None,
            rx_char: None,
            tx_char: None,
            notify_task: None,
        }
    }
}

#[derive(Default)]
pub struct NativeBleState(pub Arc<Mutex<NativeBleInner>>);

async fn ensure_adapter(state: &NativeBleState) -> Result<Adapter, String> {
    let mut inner = state.0.lock().await;
    if let Some(a) = &inner.adapter {
        return Ok(a.clone());
    }
    let manager = Manager::new()
        .await
        .map_err(|e| format!("Bluetooth manager gagal: {e}"))?;
    let adapters = manager
        .adapters()
        .await
        .map_err(|e| format!("Tidak ada adapter Bluetooth: {e}"))?;
    let adapter = adapters
        .into_iter()
        .next()
        .ok_or_else(|| "Bluetooth PC tidak ditemukan / nonaktif.".to_string())?;
    inner.adapter = Some(adapter.clone());
    Ok(adapter)
}

fn id_of(p: &Peripheral) -> String {
    p.id().to_string()
}

fn name_matches_preferred(local_name: &str, preferred: &str) -> bool {
    if preferred.is_empty() {
        return false;
    }
    let a = local_name.trim().to_ascii_lowercase();
    let b = preferred.trim().to_ascii_lowercase();
    !a.is_empty() && (a == b || a.contains(&b) || b.contains(&a))
}

/// Windows sering mengembalikan name="" dan services=[] meski device
/// sudah lolos ScanFilter NUS. `trust_scan_filter` = terima semua hasil scan itu.
fn accept_peripheral(
    local_name: &str,
    services: &[Uuid],
    preferred: &str,
    trust_scan_filter: bool,
) -> bool {
    if trust_scan_filter {
        return true;
    }
    if name_matches_preferred(local_name, preferred) {
        return true;
    }
    if services.iter().any(|u| *u == SERVICE_UUID) {
        return true;
    }
    let lower = local_name.to_ascii_lowercase();
    lower.contains("garudabot") || lower.starts_with("esp32")
}

fn emit_peripheral(app: &AppHandle, id: &str, name: &str, rssi: Option<i16>) {
    let _ = app.emit(
        EVENT_PERIPHERAL,
        json!({ "peripheralId": id, "name": name, "rssi": rssi }),
    );
}

async fn disconnect_locked(inner: &mut NativeBleInner) {
    if let Some(handle) = inner.notify_task.take() {
        handle.abort();
    }
    if let Some(p) = inner.connected.take() {
        let _ = p.disconnect().await;
    }
    inner.rx_char = None;
    inner.tx_char = None;
}

/// Mulai scan. `Ok(true)` = filter NUS aktif (hasil OS sudah terfilter).
async fn start_scan(adapter: &Adapter) -> Result<bool, String> {
    let _ = adapter.stop_scan().await;
    if adapter
        .start_scan(ScanFilter {
            services: vec![SERVICE_UUID],
        })
        .await
        .is_ok()
    {
        return Ok(true);
    }
    adapter
        .start_scan(ScanFilter::default())
        .await
        .map_err(|e| format!("Gagal mulai scan BLE: {e}"))?;
    Ok(false)
}

async fn connection_status(state: &NativeBleState) -> Result<Value, String> {
    let inner = state.0.lock().await;
    let Some(p) = inner.connected.clone() else {
        return Ok(json!({
            "connected": false,
            "peripheralId": Value::Null,
            "name": Value::Null,
        }));
    };
    let has_chars = inner.rx_char.is_some() && inner.tx_char.is_some();
    drop(inner);

    let connected = has_chars && p.is_connected().await.unwrap_or(false);
    if !connected {
        return Ok(json!({
            "connected": false,
            "peripheralId": Value::Null,
            "name": Value::Null,
        }));
    }

    let id = id_of(&p);
    let name = p
        .properties()
        .await
        .ok()
        .flatten()
        .and_then(|pr| pr.local_name)
        .unwrap_or_else(|| "ESP32 BLE".to_string());
    Ok(json!({
        "connected": true,
        "peripheralId": id,
        "name": name,
    }))
}

#[tauri::command]
pub async fn ble_native_status(state: State<'_, NativeBleState>) -> Result<Value, String> {
    connection_status(&state).await
}

#[tauri::command]
pub async fn ble_native_scan(
    app: AppHandle,
    state: State<'_, NativeBleState>,
    timeout_ms: Option<u64>,
    preferred_name: Option<String>,
    preserve_connected: Option<bool>,
) -> Result<Value, String> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(12000).clamp(2000, 30000));
    let preferred = preferred_name.unwrap_or_default();
    let preserve = preserve_connected.unwrap_or(false);

    // Jangan putus sesi Live/Connect hanya karena dialog buka Search lagi.
    if preserve {
        let status = connection_status(&state).await?;
        if status
            .get("connected")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            let id = status
                .get("peripheralId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let name = status
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("ESP32 BLE")
                .to_string();
            if !id.is_empty() {
                emit_peripheral(&app, &id, &name, None);
                return Ok(json!({
                    "devices": [{
                        "peripheralId": id,
                        "name": name,
                        "rssi": Value::Null,
                    }],
                    "preserved": true,
                }));
            }
        }
    }

    {
        let mut inner = state.0.lock().await;
        disconnect_locked(&mut inner).await;
        inner.seen.clear();
    }

    let adapter = ensure_adapter(&state).await?;
    let trust_filter = start_scan(&adapter).await?;

    let deadline = Instant::now() + timeout;
    let mut found: Vec<Value> = Vec::new();
    let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    while Instant::now() < deadline {
        let peripherals = adapter
            .peripherals()
            .await
            .map_err(|e| format!("Gagal baca hasil scan: {e}"))?;

        for p in peripherals {
            let id = id_of(&p);
            let props = p.properties().await.ok().flatten();
            let local_name = props
                .as_ref()
                .and_then(|pr| pr.local_name.clone())
                .unwrap_or_default();
            let services = props
                .as_ref()
                .map(|pr| pr.services.clone())
                .unwrap_or_default();
            let rssi = props.as_ref().and_then(|pr| pr.rssi);

            if !accept_peripheral(&local_name, &services, &preferred, trust_filter) {
                continue;
            }

            {
                let mut inner = state.0.lock().await;
                inner.seen.insert(id.clone(), p);
            }

            if seen_ids.insert(id.clone()) {
                let display = if local_name.trim().is_empty() {
                    format!(
                        "ESP32-{}",
                        if id.len() > 8 {
                            &id[id.len() - 8..]
                        } else {
                            &id
                        }
                    )
                } else {
                    local_name.clone()
                };
                emit_peripheral(&app, &id, &display, rssi);
                found.push(json!({
                    "peripheralId": id,
                    "name": display,
                    "rssi": rssi,
                }));
            }
        }

        if !preferred.is_empty() {
            let hit = found.iter().any(|v| {
                v.get("name")
                    .and_then(|n| n.as_str())
                    .map(|n| name_matches_preferred(n, &preferred))
                    .unwrap_or(false)
            });
            if hit {
                tokio::time::sleep(Duration::from_millis(800)).await;
                break;
            }
        }

        tokio::time::sleep(Duration::from_millis(300)).await;
    }

    let _ = adapter.stop_scan().await;

    if !preferred.is_empty() {
        found.sort_by(|a, b| {
            let an = a.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let bn = b.get("name").and_then(|n| n.as_str()).unwrap_or("");
            name_matches_preferred(bn, &preferred)
                .cmp(&name_matches_preferred(an, &preferred))
                .reverse()
        });
    }

    Ok(json!({ "devices": found }))
}

async fn resolve_peripheral(
    state: &NativeBleState,
    adapter: &Adapter,
    peripheral_id: &str,
    preferred_name: &str,
) -> Result<Peripheral, String> {
    {
        let inner = state.0.lock().await;
        if let Some(p) = inner.seen.get(peripheral_id) {
            return Ok(p.clone());
        }
    }

    if !preferred_name.is_empty() {
        let candidates: Vec<Peripheral> = {
            let inner = state.0.lock().await;
            inner.seen.values().cloned().collect()
        };
        for p in candidates {
            let props = p.properties().await.ok().flatten();
            let local_name = props
                .as_ref()
                .and_then(|pr| pr.local_name.clone())
                .unwrap_or_default();
            if name_matches_preferred(&local_name, preferred_name) {
                return Ok(p);
            }
        }
    }

    let trust_filter = start_scan(adapter).await?;
    let deadline = Instant::now() + Duration::from_secs(12);
    let target = peripheral_id.to_string();
    let mut last: Option<Peripheral> = None;

    while Instant::now() < deadline {
        let peripherals = adapter
            .peripherals()
            .await
            .map_err(|e| format!("Gagal baca scan: {e}"))?;
        for p in peripherals {
            let id = id_of(&p);
            let props = p.properties().await.ok().flatten();
            let local_name = props
                .as_ref()
                .and_then(|pr| pr.local_name.clone())
                .unwrap_or_default();
            let services = props
                .as_ref()
                .map(|pr| pr.services.clone())
                .unwrap_or_default();

            if !accept_peripheral(&local_name, &services, preferred_name, trust_filter) {
                continue;
            }

            {
                let mut inner = state.0.lock().await;
                inner.seen.insert(id.clone(), p.clone());
            }

            if name_matches_preferred(&local_name, preferred_name) {
                let _ = adapter.stop_scan().await;
                return Ok(p);
            }
            if id == target {
                let _ = adapter.stop_scan().await;
                return Ok(p);
            }
            last = Some(p);
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    let _ = adapter.stop_scan().await;

    if let Some(p) = last {
        return Ok(p);
    }
    Err(format!(
        "Board BLE {peripheral_id} tidak ditemukan. Pastikan board menyala & Bluetooth PC aktif."
    ))
}

#[tauri::command]
pub async fn ble_native_connect(
    app: AppHandle,
    state: State<'_, NativeBleState>,
    peripheral_id: String,
    preferred_name: Option<String>,
) -> Result<Value, String> {
    let preferred = preferred_name.unwrap_or_default();

    // Sudah terhubung ke board yang sama? Jangan putus-nyambung lagi.
    {
        let inner = state.0.lock().await;
        if let Some(p) = inner.connected.clone() {
            let same_id = id_of(&p) == peripheral_id;
            let has_chars = inner.rx_char.is_some() && inner.tx_char.is_some();
            drop(inner);
            if same_id && has_chars && p.is_connected().await.unwrap_or(false) {
                let name = p
                    .properties()
                    .await
                    .ok()
                    .flatten()
                    .and_then(|pr| pr.local_name)
                    .unwrap_or_else(|| "ESP32 BLE".to_string());
                return Ok(json!({
                    "peripheralId": id_of(&p),
                    "name": name,
                    "reused": true,
                }));
            }
        }
    }

    {
        let mut inner = state.0.lock().await;
        disconnect_locked(&mut inner).await;
    }

    let adapter = ensure_adapter(&state).await?;
    let peripheral = resolve_peripheral(&state, &adapter, &peripheral_id, &preferred).await?;

    // Windows BLE sering gagal di attempt pertama — retry singkat.
    let mut last_err = String::new();
    for attempt in 1..=3 {
        match peripheral.connect().await {
            Ok(()) => {
                last_err.clear();
                break;
            }
            Err(e) => {
                last_err = format!("Gagal connect BLE (percobaan {attempt}/3): {e}");
                tokio::time::sleep(Duration::from_millis(350 * attempt as u64)).await;
            }
        }
    }
    if !last_err.is_empty() {
        return Err(last_err);
    }
    tokio::time::sleep(Duration::from_millis(450)).await;

    if !peripheral.is_connected().await.unwrap_or(false) {
        // Satu kali reconnect paksa.
        let _ = peripheral.connect().await;
        tokio::time::sleep(Duration::from_millis(500)).await;
        if !peripheral.is_connected().await.unwrap_or(false) {
            return Err(
                "BLE connect tidak bertahan. Matikan/nyalakan Bluetooth PC atau board, lalu coba lagi."
                    .to_string(),
            );
        }
    }

    let mut discover_err = None;
    for attempt in 1..=3 {
        match peripheral.discover_services().await {
            Ok(()) => {
                discover_err = None;
                break;
            }
            Err(e) => {
                discover_err = Some(format!("Gagal discover services (percobaan {attempt}/3): {e}"));
                tokio::time::sleep(Duration::from_millis(300 * attempt as u64)).await;
            }
        }
    }
    if let Some(e) = discover_err {
        return Err(e);
    }

    let chars = peripheral.characteristics();
    let rx = chars
        .iter()
        .find(|c| c.uuid == RX_UUID)
        .cloned()
        .ok_or_else(|| "Characteristic RX (NUS) tidak ditemukan.".to_string())?;
    let tx = chars
        .iter()
        .find(|c| c.uuid == TX_UUID)
        .cloned()
        .ok_or_else(|| "Characteristic TX (NUS) tidak ditemukan.".to_string())?;

    peripheral
        .subscribe(&tx)
        .await
        .map_err(|e| format!("Gagal subscribe notify: {e}"))?;

    let mut notifications = peripheral
        .notifications()
        .await
        .map_err(|e| format!("Gagal buka stream notify: {e}"))?;

    let app_notify = app.clone();
    let handle = tokio::spawn(async move {
        while let Some(n) = notifications.next().await {
            if n.uuid != TX_UUID {
                continue;
            }
            let b64 = B64.encode(&n.value);
            let _ = app_notify.emit(
                EVENT_NOTIFY,
                json!({ "message": b64, "encoding": "base64" }),
            );
        }
    });

    let props = peripheral.properties().await.ok().flatten();
    let name = props
        .and_then(|p| p.local_name)
        .unwrap_or_else(|| "ESP32 BLE".to_string());
    let id = id_of(&peripheral);

    {
        let mut inner = state.0.lock().await;
        inner.notify_task = Some(handle);
        inner.rx_char = Some(rx);
        inner.tx_char = Some(tx);
        inner.connected = Some(peripheral);
    }

    Ok(json!({ "peripheralId": id, "name": name, "reused": false }))
}

#[tauri::command]
pub async fn ble_native_write(
    state: State<'_, NativeBleState>,
    data_base64: String,
    with_response: Option<bool>,
) -> Result<(), String> {
    let bytes = B64
        .decode(data_base64.trim())
        .map_err(|e| format!("Base64 write invalid: {e}"))?;
    let with_resp = with_response.unwrap_or(false);

    let (peripheral, rx) = {
        let inner = state.0.lock().await;
        let peripheral = inner.connected.clone().ok_or_else(|| {
            "BLE belum terhubung. Search board lagi, lalu Turn Live Mode On.".to_string()
        })?;
        let rx = inner
            .rx_char
            .clone()
            .ok_or_else(|| "RX characteristic belum siap. Connect BLE ulang.".to_string())?;
        (peripheral, rx)
    };

    if !peripheral.is_connected().await.unwrap_or(false) {
        // Windows sering false-negative sebentar — cek ulang sebelum putus.
        tokio::time::sleep(Duration::from_millis(80)).await;
        if !peripheral.is_connected().await.unwrap_or(false) {
            let mut inner = state.0.lock().await;
            disconnect_locked(&mut inner).await;
            return Err(
                "Koneksi BLE putus. Search → Connect board lagi, lalu Turn Live Mode On."
                    .to_string(),
            );
        }
    }

    let write_type = if with_resp {
        WriteType::WithResponse
    } else {
        WriteType::WithoutResponse
    };

    // Retry sekali: stack Windows sering gagal write transient tanpa benar-benar putus.
    match peripheral.write(&rx, &bytes, write_type).await {
        Ok(()) => Ok(()),
        Err(e) => {
            tokio::time::sleep(Duration::from_millis(60)).await;
            if !peripheral.is_connected().await.unwrap_or(false) {
                let mut inner = state.0.lock().await;
                disconnect_locked(&mut inner).await;
                return Err(format!("Koneksi BLE putus saat write: {e}"));
            }
            peripheral
                .write(&rx, &bytes, write_type)
                .await
                .map_err(|e2| format!("BLE write gagal: {e2}"))
        }
    }
}

#[tauri::command]
pub async fn ble_native_close(state: State<'_, NativeBleState>) -> Result<(), String> {
    let mut inner = state.0.lock().await;
    disconnect_locked(&mut inner).await;
    if let Some(adapter) = &inner.adapter {
        let _ = adapter.stop_scan().await;
    }
    Ok(())
}
