//! ESP32 BLE OTA — upload program lewat Bluetooth (mengganti SoftAP WiFi OTA).
//!
//! Alur:
//! 1. Target port `ble:<peripheralId>` dari dialog Connect (Scratch Link).
//! 2. Inject `GarudabotBleOta` ke sketch agar board advertise + terima firmware.
//! 3. Compile saja (tanpa `arduino-cli upload`) → ambil `*.ino.bin` (bukan merged).
//! 4. Kirim JSON `{ mode, peripheralId, firmwareBase64 }` ke frontend;
//!    frontend yang menulis chunk lewat Scratch Link WebSocket.
//!
//! Protocol (harus cocok dengan firmware `GarudabotBleOta` + JS `lib/ble/protocol.js`):
//! - CMD_BEGIN 0x01 + u32 LE size
//! - CMD_DATA  0x02 + payload bytes
//! - CMD_END   0x03
//! Status notify: ACK:BEGIN | N:<bytes> | OK | ERR:...

use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use tauri::{AppHandle, Emitter};

use crate::arduino_cli;

const INCLUDE_LINE: &str = "#include <GarudabotBleOta.h>";
const SETUP_CALL_PREFIX: &str = "GarudabotBleOta::begin(";
const LOOP_CALL: &str = "GarudabotBleOta::loop();";
const DEFAULT_BLE_NAME: &str = "Garudabot";
const BLE_NAME_MAX_LEN: usize = 15;

/// Port virtual dari UI: `ble:<ScratchLink peripheralId>` (bukan COM / IP).
pub(crate) fn is_ble_port(port: &str) -> bool {
    port.starts_with("ble:")
}

pub(crate) fn peripheral_id_from_port(port: &str) -> Result<String, String> {
    let id = port.trim_start_matches("ble:").trim();
    if id.is_empty() {
        return Err("Peripheral BLE tidak valid.".to_string());
    }
    Ok(id.to_string())
}

/// Bersihkan nama agar aman sebagai string C di sketch (huruf/angka/-/_).
pub(crate) fn sanitize_ble_device_name(raw: Option<&str>) -> String {
    let candidate = raw.unwrap_or(DEFAULT_BLE_NAME).trim();
    let name = if candidate.is_empty() {
        DEFAULT_BLE_NAME
    } else {
        candidate
    };

    let mut out = String::new();
    for (i, ch) in name.chars().enumerate() {
        if out.len() >= BLE_NAME_MAX_LEN {
            break;
        }
        let ok = ch.is_ascii_alphanumeric() || ((ch == '-' || ch == '_') && i > 0);
        if ok {
            out.push(ch);
        }
    }
    if out.is_empty() {
        DEFAULT_BLE_NAME.to_string()
    } else {
        out
    }
}

/// Contoh hasil: `GarudabotBleOta::begin("Mobil-01");`
fn setup_call_for_name(device_name: &str) -> String {
    format!("GarudabotBleOta::begin(\"{}\");", device_name)
}

/// Sisipkan library OTA BLE ke sketch, dengan nama advertising custom.
/// Tanpa ini board tidak advertise / tidak bisa di-upload ulang lewat BLE.
pub(crate) fn inject_ble_ota_support(code: &str, device_name: Option<&str>) -> String {
    let ble_name = sanitize_ble_device_name(device_name);
    let setup_call = setup_call_for_name(&ble_name);

    // Sketch sudah punya begin(...) → ganti argumen namanya saja.
    if code.contains(SETUP_CALL_PREFIX) {
        return replace_begin_call(code, &setup_call);
    }

    let mut sketch = code.to_string();
    if !sketch.contains(INCLUDE_LINE) {
        sketch = format!("{}\n{}", INCLUDE_LINE, sketch);
    }

    sketch = inject_call_into_arduino_fn(&sketch, "setup", &setup_call);
    if !sketch.contains(LOOP_CALL) {
        sketch = inject_call_into_arduino_fn(&sketch, "loop", LOOP_CALL);
    }
    sketch
}

/// Ganti pemanggilan `GarudabotBleOta::begin(...);` yang sudah ada.
fn replace_begin_call(code: &str, setup_call: &str) -> String {
    let bytes = code.as_bytes();
    if let Some(start) = code.find(SETUP_CALL_PREFIX) {
        let mut end = start + SETUP_CALL_PREFIX.len();
        while end < bytes.len() && bytes[end] != b';' {
            end += 1;
        }
        if end < bytes.len() {
            end += 1; // sertakan ';'
            let mut out = String::with_capacity(code.len() + setup_call.len());
            out.push_str(&code[..start]);
            out.push_str(setup_call);
            out.push_str(&code[end..]);
            return out;
        }
    }
    code.to_string()
}

/// Sisipkan `call` tepat setelah `{` pembuka `void fn_name()`.
fn inject_call_into_arduino_fn(sketch: &str, fn_name: &str, call: &str) -> String {
    let needle = format!("void {}()", fn_name);
    let Some(fn_pos) = sketch.find(&needle) else {
        return sketch.to_string();
    };
    let Some(brace_rel) = sketch[fn_pos..].find('{') else {
        return sketch.to_string();
    };
    let insert_at = fn_pos + brace_rel + 1;
    let injection = format!("\n    {}\n", call);
    let mut out = String::with_capacity(sketch.len() + injection.len());
    out.push_str(&sketch[..insert_at]);
    out.push_str(&injection);
    out.push_str(&sketch[insert_at..]);
    out
}

fn collect_files(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            out.extend(collect_files(&path));
        } else {
            out.push(path);
        }
    }
    out
}

fn is_app_firmware_bin(name: &str) -> bool {
    name.ends_with(".bin")
        && !name.contains("merged")
        && !name.contains("bootloader")
        && !name.contains("partitions")
        && !name.contains("boot_app0")
}

/// Prefer `*.ino.bin` (app image untuk Arduino `Update.begin`).
/// Jangan pakai `*.merged.bin` (full flash ~4MB) — salah untuk BLE OTA.
fn find_firmware_bin(build_dir: &Path) -> Result<PathBuf, String> {
    let files = collect_files(build_dir);

    let mut preferred: Vec<PathBuf> = files
        .iter()
        .filter(|p| {
            let name = file_name_lower(p);
            name.ends_with(".ino.bin") && !name.contains("merged")
        })
        .cloned()
        .collect();

    if preferred.is_empty() {
        preferred = files
            .iter()
            .filter(|p| {
                let name = file_name_lower(p);
                is_app_firmware_bin(&name) && name.contains("racero")
            })
            .cloned()
            .collect();
    }

    if preferred.is_empty() {
        preferred = files
            .into_iter()
            .filter(|p| is_app_firmware_bin(&file_name_lower(p)))
            .collect();
    }

    // App image is typically the only match; if several, pick smallest (not merged-sized).
    preferred.sort_by_key(|p| p.metadata().map(|m| m.len()).unwrap_or(u64::MAX));
    preferred
        .into_iter()
        .next()
        .ok_or_else(|| "Firmware .bin tidak ditemukan setelah compile.".to_string())
}

fn file_name_lower(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase()
}

pub(crate) async fn compile_firmware_bin(
    app: &AppHandle,
    sketch_path: String,
    sketch_dir: &Path,
    fqbn: &str,
) -> Result<(PathBuf, Vec<u8>), String> {
    let build_path = sketch_dir.join("build");
    let build_path_str = build_path
        .to_str()
        .ok_or_else(|| "Path build tidak valid.".to_string())?
        .to_string();
    let _ = fs::remove_dir_all(&build_path);

    let mut compile_args = vec![
        "compile".to_string(),
        "--fqbn".to_string(),
        arduino_cli::fqbn_with_safe_upload_speed(fqbn),
        "--build-path".to_string(),
        build_path_str,
    ];
    arduino_cli::append_libraries(app, &mut compile_args);
    compile_args.push(sketch_path);

    let compile_code = arduino_cli::run_with_logs(app, compile_args).await?;
    if compile_code != 0 {
        return Err(format!("Compile gagal (exit code {}).", compile_code));
    }

    let bin_path = find_firmware_bin(&build_path)?;
    let bytes = fs::read(&bin_path).map_err(|e| format!("Gagal baca firmware: {}", e))?;
    if bytes.is_empty() {
        return Err("Firmware .bin kosong.".to_string());
    }
    Ok((bin_path, bytes))
}

/// Compile sketch dan bungkus hasilnya untuk uploader BLE di frontend
/// (bukan flash langsung lewat serial/USB).
pub(crate) async fn prepare_ble_ota_payload(
    app: &AppHandle,
    sketch_path: String,
    sketch_dir: &Path,
    fqbn: &str,
    peripheral_id: &str,
) -> Result<String, String> {
    let _ = app.emit(
        "compiler-log",
        format!(
            "Mode BLE OTA — compile firmware, kirim lewat Scratch Link ke {}.\n",
            peripheral_id
        ),
    );

    let (bin_path, bytes) = compile_firmware_bin(app, sketch_path, sketch_dir, fqbn).await?;
    let _ = app.emit(
        "compiler-log",
        format!(
            "Compile OK: {} ({} bytes). Siap kirim BLE OTA...\n",
            bin_path.display(),
            bytes.len()
        ),
    );

    let firmware_b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(serde_json::json!({
        "mode": "ble-ota",
        "peripheralId": peripheral_id,
        "size": bytes.len(),
        "firmwareBase64": firmware_b64
    })
    .to_string())
}
