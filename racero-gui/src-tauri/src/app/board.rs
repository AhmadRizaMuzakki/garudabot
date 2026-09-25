use std::fs;
use std::sync::Arc;

use firmata_rs::{Board, Firmata};
use serialport::{ClearBuffer, DataBits, Parity, StopBits, FlowControl};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

use crate::app::serial_monitor::{self, SerialMonitorState};
use crate::app::state::AppState;
use crate::arduino_cli;
use crate::ble::ota as ble_ota;

pub(crate) fn is_ipv4_address(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    if parts.len() != 4 {
        return false;
    }
    parts.iter().all(|part| part.parse::<u8>().is_ok())
}

pub(crate) fn is_network_serial_port(port: &str) -> bool {
    port.starts_with("net:")
}

pub(crate) fn looks_like_ip_and_port(port: &str) -> bool {
    let Some((host, port_num)) = port.rsplit_once(':') else {
        return false;
    };
    is_ipv4_address(host) && port_num.parse::<u16>().is_ok()
}

pub(crate) fn normalize_upload_port(port: &str, fqbn: &str, ota_password: &str) -> (String, Vec<String>) {
    // ESP32 wireless OTA: IP saja + protocol network (bukan net:IP:8266 / ESP-01)
    if fqbn.contains("esp32")
        && (is_network_serial_port(port) || looks_like_ip_and_port(port) || is_ipv4_address(port))
    {
        let address = port.strip_prefix("net:").unwrap_or(port);
        let host = address.split(':').next().unwrap_or(address);
        return (
            host.to_string(),
            vec![
                "--protocol".to_string(),
                "network".to_string(),
                "--discovery-timeout".to_string(),
                "30s".to_string(),
                "--upload-field".to_string(),
                format!("password={}", ota_password),
            ],
        );
    }

    if is_network_serial_port(port) {
        return (port.to_string(), Vec::new());
    }

    if looks_like_ip_and_port(port) {
        return (format!("net:{}", port), Vec::new());
    }

    (port.to_string(), Vec::new())
}

pub(crate) async fn run_arduino_cli_with_logs(app: &AppHandle, args: Vec<String>) -> Result<i32, String> {
    arduino_cli::run_with_logs(app, args, arduino_cli::QuietPhase::Verbose).await
}

pub(crate) async fn run_arduino_cli_quiet(
    app: &AppHandle,
    args: Vec<String>,
    phase: arduino_cli::QuietPhase,
) -> Result<i32, String> {
    arduino_cli::run_with_logs(app, args, phase).await
}

pub(crate) async fn board_install_firmata(app: &AppHandle, port: &String, fqbn: &String) -> Result<String, String> {
    // Live Mode USB butuh Firmata (+ servo/display) di sketchbook terisolasi.
    arduino_cli::ensure_live_mode_libraries(app).await?;

    let firmware_code = include_str!("../firmware/StandardFirmata.ino");

    let sketch_dir = std::env::temp_dir().join("StandardFirmata");
    std::fs::create_dir_all(&sketch_dir).map_err(|e| e.to_string())?;

    let sketch_path = sketch_dir.join("StandardFirmata.ino");
    std::fs::write(&sketch_path, firmware_code).map_err(|e| e.to_string())?;

    let sidecar = app.shell()
        .sidecar("arduino-cli")
        .map_err(|e| format!("filed to create sidecar: {}", e))?;

    let safe_fqbn = arduino_cli::fqbn_with_safe_upload_speed(fqbn);
    let mut args = vec![
        "compile".to_string(),
        "--upload".to_string(),
        "--fqbn".to_string(),
        safe_fqbn,
        "--port".to_string(),
        port.clone(),
    ];
    // Bundel GarudabotBleOta / WeELF (ESP32) + path library aman.
    arduino_cli::append_libraries(app, &mut args);
    args.push(sketch_dir.to_str().unwrap().to_string());

    let isolated_user = arduino_cli::isolated_sketchbook_dir();
    let output = sidecar
        .env("ARDUINO_DIRECTORIES_USER", &isolated_user)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("{}", e))?;

    if output.status.success() {
        Ok(format!("firmata flashed to {} successfully!", port))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let msg = if stderr.trim().is_empty() {
            stdout.to_string()
        } else {
            stderr.to_string()
        };
        Err(msg)
    }
}

#[tauri::command]
pub async fn board_compile_ble_live(
    app: AppHandle,
    fqbn: String,
    port: String,
    ble_device_name: Option<String>,
) -> Result<String, String> {
    if !ble_ota::is_ble_port(&port) {
        return Err("board_compile_ble_live membutuhkan target ble:<id>.".to_string());
    }
    if !fqbn.contains("esp32") {
        return Err("Live Mode BLE hanya untuk ESP32.".to_string());
    }
    let peripheral_id = ble_ota::peripheral_id_from_port(&port)?;
    ble_ota::prepare_ble_live_payload(
        &app,
        &fqbn,
        &peripheral_id,
        ble_device_name.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn board_connect(app: AppHandle, address: String, fqbn: String, state: State<'_, AppState>) -> Result<String, String> {
    if let Some(sm) = app.try_state::<SerialMonitorState>() {
        serial_monitor::force_close_if_port_notify(&app, &sm, &address);
    }

    match board_install_firmata(&app, &address, &fqbn).await {
        Ok(msg) => println!("Arduino CLI: {}", msg),
        Err(e) => return Err(format!("Arduino CLI: {}", e)),
    }

    println!("SERIALPORT: connecting to {} ({})", address, fqbn);
    let mut port = serialport::new(&address, 57_600)
        .data_bits(DataBits::Eight)
        .parity(Parity::None)
        .stop_bits(StopBits::One)
        .flow_control(FlowControl::None)
        .timeout(std::time::Duration::from_millis(1000))
        .open()
        .map_err(|e| format!("SERIALPORT: failed to open serial port {}: {}", address, e))?;

    port.write_data_terminal_ready(true).unwrap_or(());
    println!("SERIALPORT: successfully connected to {} ({})", address, fqbn);

    // ESP32 resets slower than UNO on DTR
    let sleep_ms = if fqbn.contains("esp32") { 3000 } else { 1500 };
    println!("FIRMATA: waiting for {} ({}) to finish sleeping", address, fqbn);
    std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
    port.clear(ClearBuffer::All).unwrap_or(());

    let tx_connection = port.try_clone()
        .map_err(|e| format!("SERIALPORT: failed to clone port: {}", e))?;

    {
        let mut tx = state.tx_connection.lock().unwrap();
        *tx = Some(tx_connection);
    }

    println!("FIRMATA: initializing connection with {} ({})", address, fqbn);
    let board = Board::new(Box::new(port))
        .map_err(|e| format!("FIRMATA: initialization failed: {:?}", e))?;

    {
        let mut connection_state = state.connection.lock().unwrap();
        *connection_state = Some(board);
    }

    // Pump messages until pins are populated
    let start = std::time::Instant::now();
    loop {
        if start.elapsed().as_secs() > 5 {
            return Err("FIRMATA: timed out waiting for board capability response".to_string());
        }

        {
            let mut connection_state = state.connection.lock().unwrap();
            if let Some(board) = connection_state.as_mut() {
                let _ = board.read_and_decode();
                if !board.pins.is_empty() {
                    println!("FIRMATA: board ready with {} pins", board.pins.len());
                    break;
                }
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    // Only start background thread AFTER board is confirmed ready
    let thread_connection = Arc::clone(&state.connection);
    std::thread::spawn(move || {
        loop {
            if let Ok(mut lock) = thread_connection.try_lock() {
                if let Some(b) = lock.as_mut() {
                    let _ = b.read_and_decode();
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    });

    Ok(format!("FIRMATA: successfully connected to {} ({})", address, fqbn))
}

#[tauri::command]
pub fn board_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    // Lepas Firmata + clone TX — kalau tx_connection tertinggal, COM tetap "busy".
    {
        let mut connection_state = state.connection.lock().unwrap();
        *connection_state = None;
    }
    {
        let mut tx = state.tx_connection.lock().unwrap();
        *tx = None;
    }
    // Reset dedupe motor supaya connect berikutnya kirim perintah awal.
    if let Ok(mut guard) = crate::app::firmata::LAST_MOTOR.lock() {
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn board_install_esp01_bridge(app: AppHandle, port: String) -> Result<String, String> {
    let _ = run_arduino_cli_with_logs(
        &app,
        vec![
            "core".to_string(),
            "install".to_string(),
            "esp8266:esp8266".to_string(),
        ],
    ).await;

    let firmware_code = include_str!("../firmware/Esp01ArduinoBridge.ino");
    let sketch_dir = std::env::temp_dir().join("Esp01ArduinoBridge");
    fs::create_dir_all(&sketch_dir).map_err(|e| e.to_string())?;
    fs::write(sketch_dir.join("Esp01ArduinoBridge.ino"), firmware_code)
        .map_err(|e| e.to_string())?;

    let fqbn = "esp8266:esp8266:esp01_1m";
    let exit_code = run_arduino_cli_with_logs(
        &app,
        vec![
            "compile".to_string(),
            "--upload".to_string(),
            "--fqbn".to_string(),
            fqbn.to_string(),
            "--port".to_string(),
            port,
            sketch_dir.to_str().unwrap().to_string(),
        ],
    ).await?;

    if exit_code == 0 {
        Ok(format!(
            "Firmware bridge terpasang. Hotspot: Garudabot-Bridge / 12345678, port TCP {}.",
            8266
        ))
    } else {
        Err(format!(
            "Gagal flash ESP-01 (exit code {}). Pastikan USB-TTL 3.3V terhubung dan core esp8266 terpasang.",
            exit_code
        ))
    }
}

pub(crate) fn fqbn_with_safe_upload_speed(fqbn: &str) -> String {
    arduino_cli::fqbn_with_safe_upload_speed(fqbn)
}

/// Port USB nyata untuk upload (bukan Bluetooth SPP / phantom COM).
struct UsbSerialCandidate {
    address: String,
    label: String,
}

fn is_bluetoothish_label(label: &str) -> bool {
    let l = label.to_ascii_lowercase();
    l.contains("bluetooth") || l.contains("standard serial over bluetooth")
}

fn list_usb_serial_candidates() -> Vec<UsbSerialCandidate> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| {
            let address = p.port_name;
            // Hanya USB nyata. Bluetooth SPP di Windows sering "Unknown" / BluetoothPort
            // dan tidak bisa dipakai esptool.
            let label = match &p.port_type {
                serialport::SerialPortType::UsbPort(info) => {
                    let product = info.product.clone().unwrap_or_default();
                    if product.is_empty() {
                        address.clone()
                    } else {
                        format!("{} ({})", address, product)
                    }
                }
                _ => return None,
            };
            if is_bluetoothish_label(&label) {
                return None;
            }
            let u = address.to_ascii_uppercase();
            if !(u.starts_with("COM") || u.starts_with("/DEV/TTY") || u.starts_with("/DEV/CU.")) {
                return None;
            }
            Some(UsbSerialCandidate { address, label })
        })
        .collect()
}

/// Windows COM10+ sering perlu prefix \\.\ agar bisa dibuka.
fn windows_port_path(port: &str) -> String {
    let u = port.to_ascii_uppercase();
    if let Some(num) = u.strip_prefix("COM") {
        if let Ok(n) = num.parse::<u32>() {
            if n >= 10 && !port.starts_with(r"\\.\") {
                return format!(r"\\.\{}", port);
            }
        }
    }
    port.to_string()
}

fn probe_serial_port(port: &str) -> Result<(), String> {
    let path = windows_port_path(port);
    match serialport::new(&path, 115_200)
        .timeout(std::time::Duration::from_millis(300))
        .open()
    {
        Ok(p) => {
            let _ = p.clear(ClearBuffer::All);
            drop(p);
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Cek COM USB; prefer port yang diminta user. Probe gagal ≠ batalkan upload
/// (Windows sering "device not functioning" sementara — biarkan esptool mencoba).
fn resolve_usb_serial_port(app: &AppHandle, requested: &str) -> Result<String, String> {
    let candidates = list_usb_serial_candidates();
    let all_raw: Vec<String> = serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.port_name)
        .collect();

    let _ = app.emit(
        "compiler-log",
        format!(
            "Port USB: {}{}\n",
            requested,
            if candidates
                .iter()
                .any(|c| c.address.eq_ignore_ascii_case(requested))
            {
                String::new()
            } else if candidates.is_empty() {
                " (tidak terdeteksi sebagai USB)".to_string()
            } else {
                format!(
                    " → kandidat: {}",
                    candidates
                        .iter()
                        .map(|c| c.address.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            }
        ),
    );

    // Port yang dipilih user + tipe USB → pakai itu (esptool yang final).
    if let Some(c) = candidates
        .iter()
        .find(|c| c.address.eq_ignore_ascii_case(requested))
    {
        match probe_serial_port(&c.address) {
            Ok(()) => return Ok(c.address.clone()),
            Err(err) => {
                let _ = app.emit(
                    "compiler-log",
                    format!(
                        "Peringatan: {} belum bisa dibuka ({}) — tetap coba upload ke {}...\n",
                        c.address, err, c.address
                    ),
                );
                return Ok(c.address.clone());
            }
        }
    }

    let mut openable: Vec<&UsbSerialCandidate> = candidates
        .iter()
        .filter(|c| probe_serial_port(&c.address).is_ok())
        .collect();

    if openable.len() == 1 {
        let alt = openable[0].address.clone();
        if !alt.eq_ignore_ascii_case(requested) {
            let _ = app.emit(
                "compiler-log",
                format!(
                    "Port {} tidak di daftar USB — otomatis pakai {}.\n",
                    requested, alt
                ),
            );
        }
        return Ok(alt);
    }

    if openable.is_empty() {
        let has_usb_candidate = !candidates.is_empty();
        return Err(format!(
            "Tidak ada port USB ESP32 yang siap.\n\n\
             Yang diminta: {}.\n\
             Port di sistem: {}.\n\
             Kandidat USB: {}.\n\n\
             {}\
             Cabut-colok kabel USB data, tutup Serial Monitor lain, lalu Board → Connect lagi.",
            requested,
            if all_raw.is_empty() {
                "(kosong)".to_string()
            } else {
                all_raw.join(", ")
            },
            if candidates.is_empty() {
                "(tidak ada)".to_string()
            } else {
                candidates
                    .iter()
                    .map(|c| c.address.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            },
            if has_usb_candidate {
                "Port USB terdaftar tapi Windows menolak dibuka (sering setelah BLE/reset).\n"
            } else {
                "COM3/COM4 sering Bluetooth PC — bukan upload USB.\n"
            }
        ));
    }

    openable.sort_by_key(|c| {
        let l = c.label.to_ascii_lowercase();
        let score = if l.contains("esp")
            || l.contains("silicon")
            || l.contains("cp210")
            || l.contains("ch340")
            || l.contains("usb-serial")
            || l.contains("uart")
        {
            0
        } else {
            1
        };
        (score, c.address.clone())
    });
    let alt = openable[0].address.clone();
    let _ = app.emit(
        "compiler-log",
        format!(
            "Beberapa port USB — memakai {} ({}).\n",
            alt,
            openable[0].label
        ),
    );
    Ok(alt)
}

async fn resolve_usb_serial_port_with_retry(
    app: &AppHandle,
    requested: &str,
    attempts: u32,
) -> Result<String, String> {
    let mut last_err = String::new();
    for i in 1..=attempts {
        match resolve_usb_serial_port(app, requested) {
            Ok(p) => return Ok(p),
            Err(e) => {
                last_err = e;
                if i < attempts {
                    let _ = app.emit(
                        "compiler-log",
                        format!("Menunggu port USB… ({}/{})\n", i, attempts),
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
                }
            }
        }
    }
    Err(last_err)
}

#[tauri::command]
pub async fn board_compile_and_flash(
    app: AppHandle,
    code: String,
    fqbn: String,
    port: String,
    ota_password: Option<String>,
    ble_device_name: Option<String>,
) -> Result<String, String> {
    if let Some(sm) = app.try_state::<SerialMonitorState>() {
        serial_monitor::force_close_if_port_notify(&app, &sm, &port);
    }

    let sketch_name = "racero_project";

    let mut sketch_dir = std::env::temp_dir();
    sketch_dir.push(sketch_name);
    if !sketch_dir.exists() {
        fs::create_dir_all(&sketch_dir).map_err(|e| format!("Arduino CLI: {}", e))?;
    }

    let sketch_file_path = sketch_dir.join(format!("{}.ino", sketch_name));
    let is_esp32 = fqbn.contains("esp32");
    // Upload wireless ESP32: target `ble:<id>` (Bluetooth native), bukan WiFi SoftAP.
    let is_ble_ota = ble_ota::is_ble_port(&port);

    if is_esp32
        && !is_ble_ota
        && (is_network_serial_port(&port) || looks_like_ip_and_port(&port) || is_ipv4_address(&port))
    {
        return Err(
            "ESP32 wireless upload sekarang lewat BLE, bukan WiFi SoftAP.\n\
             Connect ke perangkat BLE, atau pakai USB COM."
                .to_string(),
        );
    }

    let password_input = ota_password.unwrap_or_default();
    let ble_name = ble_ota::sanitize_ble_device_name(ble_device_name.as_deref());
    // Setiap compile ESP32 (USB maupun BLE) menyertakan GarudabotBleOta agar board
    // tetap bisa di-discover / di-OTA ulang setelah flash.
    let sketch_code = if is_esp32 {
        let injected = ble_ota::inject_ble_ota_support(&code, Some(&ble_name));
    // begin(name) → pastikan flag false ikut tersimpan di sketch inject.
    let begin_marker = format!("GarudabotBleOta::begin(\"{}\", false)", ble_name);
        let ok = injected.contains(&begin_marker);
        // USB: diam jika OK; hanya log jika gagal. BLE: tetap ringkas.
        if !ok {
            let _ = app.emit(
                "compiler-log",
                format!(
                    "PERINGATAN: inject nama BLE \"{}\" gagal — board mungkin tetap Garudabot.\n",
                    ble_name
                ),
            );
        } else if is_ble_ota {
            let _ = app.emit(
                "compiler-log",
                format!("BLE inject: begin(\"{}\").\n", ble_name),
            );
        }
        injected
    } else {
        code
    };
    fs::write(&sketch_file_path, sketch_code).map_err(|e| format!("Arduino CLI: {}", e))?;

    let sketch_path = sketch_dir.to_str().unwrap().to_string();

    // Cabang Bluetooth: compile → JSON firmware; frontend kirim lewat BLE native.
    // Cabang USB: lanjut arduino-cli upload seperti biasa di bawah.
    if is_ble_ota {
        if !is_esp32 {
            return Err("Upload BLE hanya untuk board ESP32.".to_string());
        }
        let peripheral_id = ble_ota::peripheral_id_from_port(&port)?;
        return ble_ota::prepare_ble_ota_payload(
            &app,
            sketch_path,
            &sketch_dir,
            &fqbn,
            &peripheral_id,
        )
        .await;
    }

    let (mut upload_port, extra_args) = normalize_upload_port(&port, &fqbn, &password_input);

    if fqbn.contains("esp32") && is_ipv4_address(&upload_port) {
        return Err(
            "Upload OTA WiFi ESP32 sudah diganti ke BLE. Sambungkan BLE atau USB."
                .to_string(),
        );
    }

    let is_net = is_network_serial_port(&upload_port) || looks_like_ip_and_port(&port);

    // Build path tetap di sketch temp → upload ke-2+ reuse cache core ESP32.
    let build_path = sketch_dir.join("build");
    let _ = fs::create_dir_all(&build_path);

    // 1) Compile saja dulu (tanpa buka COM) — compile lama, COM bisa berubah di tengah.
    let mut compile_args = vec![
        "compile".to_string(),
        "--fqbn".to_string(),
        fqbn_with_safe_upload_speed(&fqbn),
    ];
    if fqbn == "racero:avr:32:hunaupload=enabled" {
        compile_args.push("--build-property".to_string());
        compile_args.push("compiler.cpp.extra_flags=-DTIMSK1=TIMSK -DTIFR1=TIFR".to_string());
    }
    arduino_cli::append_compile_speed_args(&mut compile_args, Some(&build_path));
    arduino_cli::append_libraries_quiet(&app, &mut compile_args);
    compile_args.push(sketch_path.clone());

    let compile_code =
        run_arduino_cli_quiet(&app, compile_args, arduino_cli::QuietPhase::Compile).await?;
    if compile_code != 0 {
        return Err(format!("Compile gagal (exit code {}).", compile_code));
    }

    // 2) Sebelum upload: lepas handle COM lagi (Firmata/Live) lalu resolve port.
    if !is_net {
        let _ = app.emit("compiler-log", "Menyiapkan port USB...\n");
        {
            let state = app.state::<AppState>();
            let _ = board_disconnect(state);
        }
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        upload_port = resolve_usb_serial_port_with_retry(&app, &upload_port, 4).await?;
        // COM10+ di Windows: esptool lebih andal dengan \\.\COM11
        upload_port = windows_port_path(&upload_port);
    }

    let mut upload_args = vec![
        "upload".to_string(),
        "--fqbn".to_string(),
        fqbn_with_safe_upload_speed(&fqbn),
        "--port".to_string(),
        upload_port.clone(),
        "--input-dir".to_string(),
        build_path.to_string_lossy().into_owned(),
    ];
    upload_args.extend(extra_args);

    if is_net {
        let _ = app.emit(
            "compiler-log",
            format!(
                "Upload WiFi ke Arduino via {} — pastikan PC sudah join hotspot ESP.\n",
                upload_port
            ),
        );
    } else {
        let display = upload_port.trim_start_matches(r"\\.\");
        let _ = app.emit(
            "compiler-log",
            format!("Upload ke {}...\n", display),
        );
    }

    let exit_code =
        run_arduino_cli_quiet(&app, upload_args, arduino_cli::QuietPhase::Upload).await?;

    if exit_code != 0 {
        let hint = if is_net {
            "\nTips WiFi Arduino+ESP-01:\n\
             - PC harus terhubung ke hotspot ESP (mis. Garudabot-Bridge atau ESPTest 2)\n\
             - Cek IP ESP (biasanya 192.168.4.1) dan port bridge (8266 atau 23)\n\
             - GPIO2 ESP harus ke RESET Arduino lewat kapasitor 100nF\n\
             - Flash firmware bridge ke ESP-01 sekali via USB-TTL 3.3V"
        } else {
            "\nTips USB:\n\
             - Cabut-colok kabel USB, lalu Board → Connect ke COM yang muncul\n\
             - Tutup Arduino IDE / Serial Monitor yang memakai port yang sama\n\
             - Untuk ESP32: tahan tombol BOOT saat upload jika perlu"
        };
        return Err(format!("Upload gagal (exit code {}).{}", exit_code, hint));
    }

    Ok("Compilation cycle complete.".to_string())
}

