//! Serial Monitor USB — baca/tulis COMx untuk debug (UI hanya di mode dev).
//! Satu COM tidak boleh dibuka bersamaan dengan Firmata / arduino-cli upload.

use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serialport::{ClearBuffer, DataBits, FlowControl, Parity, SerialPort, StopBits};
use tauri::{AppHandle, Emitter, State};

type SharedPort = Arc<Mutex<Option<Box<dyn SerialPort>>>>;

pub struct SerialMonitorState {
    pub shared: SharedPort,
    pub stop: Arc<AtomicBool>,
    pub reader: Mutex<Option<thread::JoinHandle<()>>>,
    pub open_path: Mutex<Option<String>>,
}

impl Default for SerialMonitorState {
    fn default() -> Self {
        Self {
            shared: Arc::new(Mutex::new(None)),
            stop: Arc::new(AtomicBool::new(false)),
            reader: Mutex::new(None),
            open_path: Mutex::new(None),
        }
    }
}

fn stop_reader(state: &SerialMonitorState) {
    state.stop.store(true, Ordering::SeqCst);
    if let Ok(mut guard) = state.reader.lock() {
        if let Some(handle) = guard.take() {
            let _ = handle.join();
        }
    }
    state.stop.store(false, Ordering::SeqCst);
}

fn close_inner(state: &SerialMonitorState) {
    stop_reader(state);
    if let Ok(mut port) = state.shared.lock() {
        *port = None;
    }
    if let Ok(mut path) = state.open_path.lock() {
        *path = None;
    }
}

/// Tutup Serial Monitor bila terbuka (sebelum upload / Firmata).
pub fn force_close_if_port_notify(app: &AppHandle, state: &SerialMonitorState, port: &str) {
    let open = state
        .open_path
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .unwrap_or_default();
    if open.is_empty() {
        return;
    }
    if port.is_empty() || open.eq_ignore_ascii_case(port) {
        close_inner(state);
        let _ = app.emit(
            "serial-monitor-data",
            "\n[Serial Monitor ditutup untuk upload / Live Mode]\n",
        );
    }
}

fn spawn_reader(app: AppHandle, shared: SharedPort, stop: Arc<AtomicBool>) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buf = [0u8; 1024];
        while !stop.load(Ordering::SeqCst) {
            let n = {
                let mut guard = match shared.lock() {
                    Ok(g) => g,
                    Err(_) => break,
                };
                match guard.as_mut() {
                    Some(port) => match port.read(&mut buf) {
                        Ok(n) => n,
                        Err(e) => {
                            let kind = e.kind();
                            if kind == std::io::ErrorKind::TimedOut
                                || kind == std::io::ErrorKind::WouldBlock
                            {
                                0
                            } else {
                                let _ = app.emit(
                                    "serial-monitor-data",
                                    format!("\n[Serial putus: {}]\n", e),
                                );
                                *guard = None;
                                break;
                            }
                        }
                    },
                    None => break,
                }
            };
            if n > 0 {
                let text = String::from_utf8_lossy(&buf[..n]).to_string();
                let _ = app.emit("serial-monitor-data", text);
            } else {
                thread::sleep(Duration::from_millis(20));
            }
        }
    })
}

#[tauri::command]
pub fn serial_monitor_open(
    app: AppHandle,
    state: State<'_, SerialMonitorState>,
    port: String,
    baud: u32,
) -> Result<(), String> {
    let port = port.trim().to_string();
    if port.is_empty() {
        return Err("Pilih port COM dulu.".to_string());
    }
    if port.to_lowercase().starts_with("ble:") {
        return Err("Serial Monitor hanya untuk USB COM, bukan BLE.".to_string());
    }
    let baud = if baud == 0 { 115_200 } else { baud };

    close_inner(&state);

    let mut sp = serialport::new(&port, baud)
        .data_bits(DataBits::Eight)
        .parity(Parity::None)
        .stop_bits(StopBits::One)
        .flow_control(FlowControl::None)
        .timeout(Duration::from_millis(200))
        .open()
        .map_err(|e| format!("Gagal buka {}: {}", port, e))?;

    let _ = sp.clear(ClearBuffer::All);

    {
        let mut guard = state.shared.lock().map_err(|e| e.to_string())?;
        *guard = Some(sp);
    }
    {
        let mut path = state.open_path.lock().map_err(|e| e.to_string())?;
        *path = Some(port.clone());
    }

    state.stop.store(false, Ordering::SeqCst);
    let handle = spawn_reader(
        app.clone(),
        Arc::clone(&state.shared),
        Arc::clone(&state.stop),
    );
    {
        let mut reader = state.reader.lock().map_err(|e| e.to_string())?;
        *reader = Some(handle);
    }

    let _ = app.emit(
        "serial-monitor-data",
        format!("[Tersambung {} @ {}]\n", port, baud),
    );
    Ok(())
}

#[tauri::command]
pub fn serial_monitor_close(state: State<'_, SerialMonitorState>) -> Result<(), String> {
    close_inner(&state);
    Ok(())
}

#[tauri::command]
pub fn serial_monitor_write(
    state: State<'_, SerialMonitorState>,
    text: String,
) -> Result<(), String> {
    let mut guard = state.shared.lock().map_err(|e| e.to_string())?;
    let port = guard
        .as_mut()
        .ok_or_else(|| "Serial Monitor belum Connect.".to_string())?;
    port.write_all(text.as_bytes())
        .map_err(|e| format!("Gagal kirim: {}", e))?;
    port.flush().map_err(|e| format!("Gagal flush: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn serial_monitor_is_open(state: State<'_, SerialMonitorState>) -> Result<bool, String> {
    let path = state
        .open_path
        .lock()
        .map_err(|e| e.to_string())?
        .is_some();
    let has_port = state
        .shared
        .lock()
        .map_err(|e| e.to_string())?
        .is_some();
    Ok(path && has_port)
}
