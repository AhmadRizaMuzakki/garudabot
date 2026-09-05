use std::fs;
use std::io::Read;
use std::time::Instant;
use std::sync::{Arc, Mutex};

use serialport::{SerialPort, ClearBuffer, DataBits, Parity, StopBits, FlowControl};
use firmata_rs::{Board, Firmata};

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{ShellExt, process::{CommandEvent, CommandChild}};

mod arduino_cli;
mod ble_ota; // Upload program ESP32 lewat Bluetooth (compile + inject + payload OTA)
mod ble_scratch_link; // Bridge opsional Scratch Link dari Rust

/// Hotspot firmware bridge ESP-01, dipakai board non-ESP32 (Arduino + ESP-01).
/// Nilainya harus sama dengan AP_SSID/AP_PASS/BRIDGE_PORT di
/// firmware/Esp01ArduinoBridge.ino.
const BRIDGE_AP_SSID_PREFIX: &str = "Garudabot";
const BRIDGE_AP_PASSWORD: &str = "12345678";
const BRIDGE_PORT: &str = "8266";

/// Gateway softAP bawaan ESP8266 (Arduino + ESP-01 bridge).
const AP_GATEWAY_IP: &str = "192.168.4.1";

struct DisplayState {
    address: u8,
    kind: u8
}

struct FirmwareConfig {
    wifi_support: bool,
    bluetooth_support: bool,
    ble_support: bool,
}

struct AppState {
    firmware_config: Mutex<Option<FirmwareConfig>>,
    connection: Arc<Mutex<Option<firmata_rs::Board<Box<dyn SerialPort>>>>>,
    tx_connection: Arc<Mutex<Option<Box<dyn SerialPort>>>>,
    detected_ports: Arc<Mutex<Vec<serde_json::Value>>>,
    display: Mutex<Option<DisplayState>>,
    watcher_child: Mutex<Option<CommandChild>>,
}

async fn board_install_firmata(app: &AppHandle, port: &String, fqbn: &String) -> Result<String, String> {
    let firmware_code = include_str!("firmware/StandardFirmata.ino");

    let sketch_dir = std::env::temp_dir().join("StandardFirmata");
    std::fs::create_dir_all(&sketch_dir).map_err(|e| e.to_string())?;

    let sketch_path = sketch_dir.join("StandardFirmata.ino");
    std::fs::write(&sketch_path, firmware_code).map_err(|e| e.to_string())?;

    let sidecar = app.shell()
        .sidecar("arduino-cli")
        .map_err(|e| format!("filed to create sidecar: {}", e))?;

    let output = sidecar
        .args([
            "compile",
            "--upload",
            "--fqbn",
            &fqbn,
            "--port",
            &port,
            sketch_dir.to_str().unwrap(),
        ])
        .output()
        .await
        .map_err(|e| format!("{}", e))?;

    if output.status.success() {
        Ok(format!("firmata flashed to {} successfully!", port))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn board_connect(app: AppHandle, address: String, fqbn: String, state: State<'_, AppState>) -> Result<String, String> {
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
fn board_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    let mut connection_state = state.connection.lock().unwrap();
    *connection_state = None;
    Ok(())
}

fn is_ipv4_address(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    if parts.len() != 4 {
        return false;
    }
    parts.iter().all(|part| part.parse::<u8>().is_ok())
}

fn is_network_serial_port(port: &str) -> bool {
    port.starts_with("net:")
}

fn looks_like_ip_and_port(port: &str) -> bool {
    let Some((host, port_num)) = port.rsplit_once(':') else {
        return false;
    };
    is_ipv4_address(host) && port_num.parse::<u16>().is_ok()
}

fn normalize_upload_port(port: &str, fqbn: &str, ota_password: &str) -> (String, Vec<String>) {
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

async fn run_arduino_cli_with_logs(app: &AppHandle, args: Vec<String>) -> Result<i32, String> {
    arduino_cli::run_with_logs(app, args).await
}

/// netsh dipanggil langsung (bukan lewat sidecar) karena ia bagian dari Windows.
/// CREATE_NO_WINDOW mencegah jendela konsol berkedip di depan pengguna.
#[cfg(windows)]
fn run_netsh(args: &[&str]) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let output = std::process::Command::new("netsh")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("WIFI: gagal menjalankan netsh: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(not(windows))]
fn run_netsh(_args: &[&str]) -> Result<String, String> {
    Err("WIFI: pairing otomatis baru tersedia di Windows.".to_string())
}

/// Ambil nilai setelah ':' dari baris berlabel SSID, mengabaikan baris BSSID.
/// Label "SSID"/"BSSID" tidak diterjemahkan oleh netsh, jadi aman dipakai
/// sebagai penanda meski bahasa Windows bukan Inggris.
fn netsh_ssid_value(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if !trimmed.starts_with("SSID") {
        return None;
    }

    let value = trimmed.split_once(':')?.1.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn parse_netsh_networks(output: &str) -> Vec<(String, Option<u8>)> {
    let mut networks: Vec<(String, Option<u8>)> = Vec::new();

    for line in output.lines() {
        if let Some(ssid) = netsh_ssid_value(line) {
            if !networks.iter().any(|(name, _)| *name == ssid) {
                networks.push((ssid, None));
            }
            continue;
        }

        // Baris kekuatan sinyal satu-satunya yang memuat '%', labelnya bisa
        // terlokalisasi ("Signal"/"Sinyal") jadi yang dipakai adalah '%'.
        if let Some(percent_pos) = line.find('%') {
            let digits: String = line[..percent_pos]
                .chars()
                .rev()
                .take_while(|c| c.is_ascii_digit())
                .collect();

            if digits.is_empty() {
                continue;
            }

            let signal = digits.chars().rev().collect::<String>().parse::<u8>().ok();
            if let Some(last) = networks.last_mut() {
                if last.1.is_none() {
                    last.1 = signal;
                }
            }
        }
    }

    networks
}

fn current_wifi_ssid() -> Option<String> {
    let output = run_netsh(&["wlan", "show", "interfaces"]).ok()?;
    output.lines().find_map(netsh_ssid_value)
}

fn xml_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn wlan_profile_xml(ssid: &str, password: &str) -> String {
    format!(
        r#"<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>{ssid}</name>
    <SSIDConfig>
        <SSID>
            <name>{ssid}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>manual</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>{password}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>
"#,
        ssid = xml_escape(ssid),
        password = xml_escape(password)
    )
}

/// Profil hotspot per jenis papan. ESP32 dipairing untuk OTA (butuh password
/// OTA), sedangkan ESP-01 bridge dipairing untuk upload serial lewat TCP
/// (butuh nomor port).
struct ApProfile {
    prefix: &'static str,
    password: &'static str,
    port: Option<&'static str>,
    ota_password: Option<&'static str>,
}

fn ap_profile(kind: &str) -> ApProfile {
    if kind == "bridge" {
        ApProfile {
            prefix: BRIDGE_AP_SSID_PREFIX,
            password: BRIDGE_AP_PASSWORD,
            port: Some(BRIDGE_PORT),
            ota_password: None,
        }
    } else {
        // ESP32 SoftAP/OTA diganti BLE + Scratch Link; scan WiFi ESP32 tidak dipakai.
        ApProfile {
            prefix: "___esp32-softap-disabled",
            password: BRIDGE_AP_PASSWORD,
            port: None,
            ota_password: None,
        }
    }
}

fn is_board_ssid(ssid: &str, prefix: &str) -> bool {
    ssid.to_uppercase().starts_with(&prefix.to_uppercase())
}

#[tauri::command]
async fn wifi_scan_boards(kind: Option<String>) -> Result<String, String> {
    let kind = kind.unwrap_or_default();

    tauri::async_runtime::spawn_blocking(move || {
        let profile = ap_profile(&kind);
        let output = run_netsh(&["wlan", "show", "networks", "mode=bssid"])?;
        let current = current_wifi_ssid();

        let boards: Vec<serde_json::Value> = parse_netsh_networks(&output)
            .into_iter()
            .filter(|(ssid, _)| is_board_ssid(ssid, profile.prefix))
            .map(|(ssid, signal)| {
                let connected = current.as_deref() == Some(ssid.as_str());
                serde_json::json!({
                    "ssid": ssid,
                    "signal": signal,
                    "connected": connected
                })
            })
            .collect();

        Ok(serde_json::json!({
            "boards": boards,
            "current_ssid": current,
            "ip": AP_GATEWAY_IP,
            "port": profile.port,
            "ota_password": profile.ota_password
        })
        .to_string())
    })
    .await
    .map_err(|e| format!("WIFI: scan gagal dijalankan: {}", e))?
}

#[tauri::command]
async fn wifi_connect_board(ssid: String, kind: Option<String>) -> Result<String, String> {
    let ssid = ssid.trim().to_string();
    if ssid.is_empty() {
        return Err("WIFI: nama hotspot kosong.".to_string());
    }

    let kind = kind.unwrap_or_default();
    let profile = ap_profile(&kind);

    // Pairing hanya untuk hotspot board, supaya tombol ini tidak bisa dipakai
    // memindahkan koneksi WiFi pengguna ke jaringan sembarangan.
    if !is_board_ssid(&ssid, profile.prefix) {
        return Err(format!(
            "WIFI: '{}' bukan hotspot board (harus diawali {}).",
            ssid, profile.prefix
        ));
    }

    tauri::async_runtime::spawn_blocking(move || {
        if current_wifi_ssid().as_deref() == Some(ssid.as_str()) {
            return Ok(serde_json::json!({
                "ssid": ssid,
                "ip": AP_GATEWAY_IP,
                "port": profile.port,
                "ota_password": profile.ota_password,
                "already_connected": true
            })
            .to_string());
        }

        let profile_path = std::env::temp_dir().join("garudabot-wlan-profile.xml");
        fs::write(&profile_path, wlan_profile_xml(&ssid, profile.password))
            .map_err(|e| format!("WIFI: gagal menulis profil WLAN: {}", e))?;

        let add_result = run_netsh(&[
            "wlan",
            "add",
            "profile",
            &format!("filename={}", profile_path.to_string_lossy()),
            "user=current",
        ])?;
        let _ = fs::remove_file(&profile_path);

        run_netsh(&["wlan", "connect", &format!("name={}", ssid), &format!("ssid={}", ssid)])
            .map_err(|e| format!("{} (profil: {})", e, add_result.trim()))?;

        // netsh connect hanya memicu; penyambungan selesai beberapa detik kemudian.
        let deadline = Instant::now();
        while deadline.elapsed().as_secs() < 20 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if current_wifi_ssid().as_deref() == Some(ssid.as_str()) {
                return Ok(serde_json::json!({
                    "ssid": ssid,
                    "ip": AP_GATEWAY_IP,
                    "port": profile.port,
                    "ota_password": profile.ota_password,
                    "already_connected": false
                })
                .to_string());
            }
        }

        Err(format!(
            "WIFI: gagal menyambung ke {} dalam 20 detik. Pastikan board menyala dan sudah pernah di-upload lewat USB.",
            ssid
        ))
    })
    .await
    .map_err(|e| format!("WIFI: pairing gagal dijalankan: {}", e))?
}

#[tauri::command]
async fn board_install_esp01_bridge(app: AppHandle, port: String) -> Result<String, String> {
    let _ = run_arduino_cli_with_logs(
        &app,
        vec![
            "core".to_string(),
            "install".to_string(),
            "esp8266:esp8266".to_string(),
        ],
    ).await;

    let firmware_code = include_str!("firmware/Esp01ArduinoBridge.ino");
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

fn append_arduino_libraries(app: &AppHandle, args: &mut Vec<String>) {
    arduino_cli::append_libraries(app, args);
}

fn fqbn_with_safe_upload_speed(fqbn: &str) -> String {
    arduino_cli::fqbn_with_safe_upload_speed(fqbn)
}

#[tauri::command]
async fn board_compile_and_flash(
    app: AppHandle,
    code: String,
    fqbn: String,
    port: String,
    ota_password: Option<String>,
) -> Result<String, String> {
    let sketch_name = "racero_project";

    let mut sketch_dir = std::env::temp_dir();
    sketch_dir.push(sketch_name);
    if !sketch_dir.exists() {
        fs::create_dir_all(&sketch_dir).map_err(|e| format!("Arduino CLI: {}", e))?;
    }

    let sketch_file_path = sketch_dir.join(format!("{}.ino", sketch_name));
    let is_esp32 = fqbn.contains("esp32");
    // Upload wireless ESP32: target `ble:<id>` (Bluetooth + Scratch Link), bukan WiFi SoftAP.
    let is_ble_ota = ble_ota::is_ble_port(&port);

    if is_esp32
        && !is_ble_ota
        && (is_network_serial_port(&port) || looks_like_ip_and_port(&port) || is_ipv4_address(&port))
    {
        return Err(
            "ESP32 wireless upload sekarang lewat BLE (Scratch Link), bukan WiFi SoftAP.\n\
             Connect ke perangkat BLE, atau pakai USB COM."
                .to_string(),
        );
    }

    let password_input = ota_password.unwrap_or_default();
    // Setiap compile ESP32 (USB maupun BLE) menyertakan GarudabotBleOta agar board
    // tetap bisa di-discover / di-OTA ulang setelah flash.
    let sketch_code = if is_esp32 {
        let _ = app.emit(
            "compiler-log",
            "ESP32: menyuntikkan GarudabotBleOta (upload BLE / USB).\n",
        );
        let injected = ble_ota::inject_ble_ota_support(&code);
        let ok = injected.contains("GarudabotBleOta::begin()");
        let _ = app.emit(
            "compiler-log",
            if ok {
                "BLE OTA inject OK — board akan advertise sebagai \"Garudabot\".\n\
                 Partition ESP32: min_spiffs (1.9MB APP) agar muat BLE + library motor.\n"
                    .to_string()
            } else {
                "PERINGATAN: inject BLE gagal (setup() tidak ditemukan). BLE mungkin tidak aktif.\n"
                    .to_string()
            },
        );
        injected
    } else {
        code
    };
    fs::write(&sketch_file_path, sketch_code).map_err(|e| format!("Arduino CLI: {}", e))?;

    let sketch_path = sketch_dir.to_str().unwrap().to_string();

    // Cabang Bluetooth: compile → JSON firmware; frontend kirim lewat Scratch Link.
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

    let (upload_port, extra_args) = normalize_upload_port(&port, &fqbn, &password_input);

    if fqbn.contains("esp32") && is_ipv4_address(&upload_port) {
        return Err(
            "Upload OTA WiFi ESP32 sudah diganti ke BLE. Sambungkan BLE atau USB."
                .to_string(),
        );
    }

    let mut args = vec![
        "compile".to_string(),
        "--upload".to_string(),
        "--fqbn".to_string(),
        fqbn_with_safe_upload_speed(&fqbn),
        "--port".to_string(),
        upload_port.clone(),
    ];
    args.extend(extra_args);

    if fqbn == "racero:avr:32:hunaupload=enabled" {
        args.push("--build-property".to_string());
        args.push("compiler.cpp.extra_flags=-DTIMSK1=TIMSK -DTIFR1=TIFR".to_string());
    }

    append_arduino_libraries(&app, &mut args);
    args.push(sketch_path);

    if is_network_serial_port(&upload_port) || looks_like_ip_and_port(&port) {
        let _ = app.emit(
            "compiler-log",
            format!(
                "Upload WiFi ke Arduino via {} — pastikan PC sudah join hotspot ESP.\n",
                upload_port
            ),
        );
    }

    let exit_code = run_arduino_cli_with_logs(&app, args).await?;

    if exit_code != 0 {
        let hint = if is_network_serial_port(&upload_port) || looks_like_ip_and_port(&port) {
            "\nTips WiFi Arduino+ESP-01:\n\
             - PC harus terhubung ke hotspot ESP (mis. Garudabot-Bridge atau ESPTest 2)\n\
             - Cek IP ESP (biasanya 192.168.4.1) dan port bridge (8266 atau 23)\n\
             - GPIO2 ESP harus ke RESET Arduino lewat kapasitor 100nF\n\
             - Flash firmware bridge ke ESP-01 sekali via USB-TTL 3.3V"
        } else {
            ""
        };
        return Err(format!("Upload gagal (exit code {}).{}", exit_code, hint));
    }

    Ok("Compilation cycle complete.".to_string())
}

fn normalize_port_entry(port: &serde_json::Value) -> serde_json::Value {
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

#[tauri::command]
async fn port_list(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let cached_ports = {
        let ports = state.detected_ports.lock().unwrap();
        ports.clone()
    };

    let normalized_ports: Vec<serde_json::Value> = if cached_ports.is_empty() {
        let result = app.shell()
            .sidecar("arduino-cli")
            .unwrap()
            .args(["board", "list", "--format", "json"])
            .output()
            .await
            .map_err(|e| e.to_string())?;

        let parsed: serde_json::Value =
            serde_json::from_str(&String::from_utf8_lossy(&result.stdout))
                .unwrap_or(serde_json::json!({}));

        parsed["ports"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .map(normalize_port_entry)
            .filter(|port| !port["address"].as_str().unwrap_or("").is_empty())
            .collect()
    } else {
        cached_ports
            .iter()
            .map(normalize_port_entry)
            .filter(|port| !port["address"].as_str().unwrap_or("").is_empty())
            .collect()
    };

    Ok(serde_json::json!({ "detected_ports": normalized_ports }).to_string())
}

#[tauri::command]
fn pin_digital_write(pin: i32, value: i32, state: State<AppState>) -> Result<(), String> {
    let mut connection_state = state.connection.lock().unwrap();

    if let Some(board) = connection_state.as_mut() {
        if board.pins[pin as usize].mode != firmata_rs::OUTPUT {
            board.set_pin_mode(pin, firmata_rs::OUTPUT)
                .map_err(|e| format!("FIRMATA: failed to set pin {} mode: {:?}", pin, e))?;
        }

        board.digital_write(pin, value)
            .map_err(|e| format!("FIRMATA: failed to write to pin {}: {:?}", pin, e))?;

        Ok(())
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
fn pin_pwm_write(pin: i32, value: i32, state: State<AppState>) -> Result<(), String> {
    let mut connection_state = state.connection.lock().unwrap();

    if let Some(board) = connection_state.as_mut() {
        if board.pins[pin as usize].mode != firmata_rs::PWM {
            board.set_pin_mode(pin, firmata_rs::PWM)
                .map_err(|e| format!("FIRMATA: failed to set pin {} mode: {:?}", pin, e))?;
        }

        board.analog_write(pin, value)
            .map_err(|e| format!("FIRMATA: failed to write to pin {}: {:?}", pin, e))?;
        Ok(())
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
fn pin_analog_write(pin: i32, value: i32, state: State<AppState>) -> Result<(), String> {
    let mut connection_state = state.connection.lock().unwrap();

    if let Some(board) = connection_state.as_mut() {
        if board.pins[pin as usize].mode != firmata_rs::PWM {
            board.set_pin_mode(pin, firmata_rs::PWM)
                .map_err(|e| format!("FIRMATA: failed to set pin {} mode: {:?}", pin, e))?;
        }

        board.analog_write(pin, value)
            .map_err(|e| format!("FIRMATA: failed to write to pin {}: {:?}", pin, e))?;

        Ok(())
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
fn pin_servo_write(pin: i32, value: i32, state: State<AppState>) -> Result<(), String> {
    let mut connection_state = state.connection.lock().unwrap();

    if let Some(board) = connection_state.as_mut() {
        if board.pins[pin as usize].mode != firmata_rs::SERVO {
            board.set_pin_mode(pin, firmata_rs::SERVO)
                .map_err(|e| format!("FIRMATA: failed to set pin {} mode: {:?}", pin, e))?;
        }

        board.analog_write(pin, value)
            .map_err(|e| format!("FIRMATA: failed to write to pin {}: {:?}", pin, e))?;

        Ok(())
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
async fn pin_tone(state: tauri::State<'_, AppState>, pin: u8, frequency: u16, duration: u16) -> Result<(), String> {
    let mut payload: Vec<u8> = vec![0xF0, 0x62];

    payload.push(0x00);
    payload.push(pin & 0x7F);

    payload.push((frequency & 0x7F) as u8);
    payload.push(((frequency >> 7) & 0x7F) as u8);

    payload.push((duration & 0x7F) as u8);
    payload.push(((duration >> 7) & 0x7F) as u8);

    payload.push(0xF7);

    let mut tx_connection_state = state.tx_connection.lock().unwrap();
    if let Some(port) = tx_connection_state.as_mut() {
        port.write_all(&payload)
            .map_err(|e| format!("FIRMATA: can't send Tone SysEx: {}", e))?;
        port.flush()
            .map_err(|e| format!("FIRMATA: can't flush connection: {}", e))?;
        Ok(())
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
async fn pin_no_tone(state: tauri::State<'_, AppState>, pin: u8) -> Result<(), String> {
    let payload: Vec<u8> = vec![0xF0, 0x5F, 0x01, pin & 0x7F, 0xF7];

    let mut tx_connection_state = state.tx_connection.lock().unwrap();
    if let Some(port) = tx_connection_state.as_mut() {
        port.write_all(&payload)
            .map_err(|e| format!("FIRMATA: can't send noTone SysEx: {}", e))?;
        port.flush()
            .map_err(|e| format!("FIRMATA: can't flush connection: {}", e))?;
        Ok(())
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
fn pin_digital_read(pin: i32, state: State<AppState>) -> Result<i32, String> {
    let mut connection_state = state.connection.lock().unwrap();

    if let Some(board) = connection_state.as_mut() {
        if board.pins[pin as usize].mode != firmata_rs::INPUT {
            board.set_pin_mode(pin, firmata_rs::INPUT)
                .map_err(|e| format!("FIRMATA: failed to set pin {} mode: {:?}", pin, e))?;
            board.report_digital(pin, 1)
                .map_err(|e| format!("FIRMATA: failed to enable pin {} reporting: {:?}", pin, e))?;
        }

        Ok(board.pins[pin as usize].value)
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
fn pin_analog_read(pin: i32, state: State<AppState>) -> Result<i32, String> {
    let mut connection_state = state.connection.lock().unwrap();

    if let Some(board) = connection_state.as_mut() {
        if board.pins[pin as usize].mode != firmata_rs::ANALOG {
            board.set_pin_mode(pin, firmata_rs::ANALOG)
                .map_err(|e| format!("FIRMATA: failed to set pin {} mode: {:?}", pin, e))?;
            board.report_analog(pin, 1)
                .map_err(|e| format!("FIRMATA: failed to enable pin {} reporting: {:?}", pin, e))?;
        }

        Ok(board.pins[pin as usize].value)
    } else {
        Err("firmata: board is not connected!".to_string())
    }
}

#[tauri::command]
async fn pin_ultrasonic_read(state: tauri::State<'_, AppState>, trig: u8, echo: u8) -> Result<f32, String> {
    let mut payload: Vec<u8>  = vec![0xF0, 0x61];

    payload.push(trig & 0x7F);
    payload.push(trig >> 7);

    payload.push(echo & 0x7F);
    payload.push(echo >> 7);

    payload.push(0xF7);

    let _connection_state = state.connection.lock().unwrap();
    let mut tx_connection_state = state.tx_connection.lock().unwrap();
    if let Some(tx_connection) = tx_connection_state.as_mut() {
        if let Ok(bytes_available) = tx_connection.bytes_to_read() {
            if bytes_available > 0 {
                let mut trash = vec![0u8; bytes_available as usize];
                let _ = tx_connection.read_exact(&mut trash);
            }
        }

        tx_connection.write_all(&payload)
            .map_err(|e| format!("FIRMATA: can't send SysEx: {}", e))?;
        tx_connection.flush()
            .map_err(|e| format!("FIRMATA: can't flush connection: {}", e))?;

        let mut buffer = [0u8; 1];
        let mut sysex: Vec<u8> = Vec::new();
        let mut insyx = false;

        let start_time = Instant::now();

        loop {
            if start_time.elapsed().as_millis() > 500 {
                return Err("FIMATA: time out while waiting for ultrasonic response".to_string());
            }

            match tx_connection.read(&mut buffer) {
                Ok(1) => {
                    let b = buffer[0];
                    if b == 0xF0 {
                        insyx = true;
                        sysex.clear();
                        sysex.push(b);
                    } else if insyx {
                        sysex.push(b);
                        if b == 0xF7 {
                            if sysex.len() == 11 && sysex[1] == 0x41 {
                                let n = (sysex[2] as u16) | ((sysex[3] as u16) << 7);
                                let f = (sysex[6] as u16) | ((sysex[7] as u16) << 7);

                                let distance = n as f32 + (f as f32 / 100.0);
                                println!("FIRMATA: ultrasonic distance: {}", distance);
                                return Ok(distance);
                            }

                            insyx = false;
                        }
                    }
                }
                Ok(_) => {}
                Err (ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    continue
                }
                Err(e) => return Err(format!("FIRMATA: read ultrasonic error: {}", e))
            }
        }
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
fn i2c_enable(state: State<'_, AppState>, address: u8, kind: u8) -> Result<(), String> {
    let mut display_lock = state.display.lock().unwrap();
    let display = display_lock.get_or_insert(DisplayState {
        address: 0,
        kind: 0,
    });

    display.address = address;
    display.kind = kind;

    let mut payload: Vec<u8>  = vec![0xF0, 0x60];

    payload.push((kind & 0x1) | ((address & 0x3F) << 1));
    payload.push(address >> 6);

    payload.push(0xF7);

    let mut tx_connection_state = state.tx_connection.lock().unwrap();
    if let Some(tx_connection) = tx_connection_state.as_mut() {
        tx_connection.write_all(&payload)
            .map_err(|e| format!("FIRMATA: can't send SysEx: {}", e))?;
        Ok(())
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
fn i2c_set_cursor(state: State<'_, AppState>, col: u8, row: u8) -> Result<(), String> {
    let mut payload: Vec<u8>  = Vec::new();
    if let Some(display) = state.display.lock().unwrap().as_ref() {
        payload.push(0xF0);
        payload.push(0x71);

        let usage_id = (display.kind + 1) as u8;
        payload.push(usage_id & 0x7F);
        payload.push(usage_id >> 7);

        payload.push(2);
        payload.push(0);

        payload.push(col & 0x7F);
        payload.push(col >> 7);

        payload.push(row & 0x7F);
        payload.push(row >> 7);

        payload.push(0xF7);
    }

    let mut tx_connection_state = state.tx_connection.lock().unwrap();
    if let Some(tx_connection) = tx_connection_state.as_mut() {
        tx_connection.write_all(&payload)
            .map_err(|e| format!("FIRMATA: can't send SysEx: {}", e))?;
        Ok(())
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
fn i2c_clear_display(state: State<'_, AppState>) -> Result<(), String> {
    let mut payload: Vec<u8>  = Vec::new();
    if let Some(display) = state.display.lock().unwrap().as_ref() {
        payload.push(0xF0);
        payload.push(0x71);

        let usage_id = (display.kind + 1) as u8;
        payload.push(usage_id & 0x7F);
        payload.push(usage_id >> 7);

        payload.push(1);
        payload.push(0);

        payload.push(0xF7);
    }

    let mut tx_connection_state = state.tx_connection.lock().unwrap();
    if let Some(tx_connection) = tx_connection_state.as_mut() {
        tx_connection.write_all(&payload)
            .map_err(|e| format!("FIRMATA: can't send SysEx: {}", e))?;
        Ok(())
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
fn i2c_write_string(state: State<'_, AppState>, string: String) -> Result<(), String> {
    let mut payload: Vec<u8>  = Vec::new();
    if let Some(display) = state.display.lock().unwrap().as_ref() {
        payload.push(0xF0);
        payload.push(0x71);

        let usage_id = (display.kind + 1) as u8;
        payload.push(usage_id & 0x7F);
        payload.push(usage_id >> 7);

        payload.push(0);
        payload.push(0);

        for byte in string.bytes() {
            payload.push(byte & 0x7F);
            payload.push(byte >> 7);
        }

        payload.push(0);
        payload.push(0);

        payload.push(0xF7);
    }

    let mut tx_connection_state = state.tx_connection.lock().unwrap();
    if let Some(tx_connection) = tx_connection_state.as_mut() {
        tx_connection.write_all(&payload)
            .map_err(|e| format!("FIRMATA: can't send SysEx: {}", e))?;
        Ok(())
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
fn file_write(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, data).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn app_quit(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            firmware_config: Mutex::new(None),
            connection: Arc::new(Mutex::new(None)),
            tx_connection: Arc::new(Mutex::new(None)),
            detected_ports: Arc::new(Mutex::new(Vec::new())),
            display: Mutex::new(None),
            watcher_child: Mutex::new(None)
        })
        .manage(ble_scratch_link::ScratchLinkBleState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                let (mut rx, child) = app_handle
                    .shell()
                    .sidecar("arduino-cli")
                    .expect("TAURI: arduino-cli watcher failed to initialize")
                    .args([
                        "board",
                        "list",
                        "--watch",
                        "--format",
                        "json"
                    ])
                    .spawn()
                    .expect("TAURI: failed to spawn arduino-cli watcher sidecar");

                {
                    let state = app_handle.state::<AppState>();
                    *state.watcher_child.lock().unwrap() = Some(child);
                }

                let mut json_buffer = String::new();
                let mut brace_count = 0;
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line_bytes) = event {
                        let chunk = String::from_utf8_lossy(&line_bytes).to_string();

                        json_buffer.push_str(&chunk);
                        for c in chunk.chars() {
                            if c == '{' { brace_count += 1; }
                            if c == '}' { brace_count -= 1; }
                        }

                        if brace_count == 0 && !json_buffer.trim().is_empty() {
                            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&json_buffer) {
                                let state = app_handle.state::<AppState>();
                                let mut ports_list = state.detected_ports.lock().unwrap();

                                let event_type = data["eventType"].as_str().unwrap_or("");
                                let incoming_port = &data["port"];

                                if event_type == "add" {
                                    let normalized = normalize_port_entry(incoming_port);
                                    if !ports_list.iter().any(|p| p["address"] == normalized["address"]) {
                                        ports_list.push(normalized);
                                    }
                                } else if event_type == "remove" {
                                    ports_list.retain(|p| p["address"] != incoming_port["address"]);
                                }

                                let payload = serde_json::json!({ "detected_ports": *ports_list });
                                app_handle.emit("ports-updated", payload.to_string()).unwrap();

                                json_buffer.clear();
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            board_connect,
            board_disconnect,
            board_install_esp01_bridge,
            board_compile_and_flash,
            wifi_scan_boards,
            wifi_connect_board,
            pin_digital_write,
            pin_pwm_write,
            pin_analog_write,
            pin_servo_write,
            pin_tone,
            pin_no_tone,
            pin_digital_read,
            pin_analog_read,
            pin_ultrasonic_read,
            port_list,
            i2c_enable,
            i2c_set_cursor,
            i2c_clear_display,
            i2c_write_string,
            file_write,
            app_quit,
            ble_scratch_link::ble_link_scan,
            ble_scratch_link::ble_link_connect,
            ble_scratch_link::ble_link_start_notifications,
            ble_scratch_link::ble_link_write,
            ble_scratch_link::ble_link_close
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                println!("TAURI: App is exiting, cleaning up background processes...");
                let state = app_handle.state::<AppState>();
                let mut watcher_guard = state.watcher_child.lock().unwrap();

                // Extract the child process and issue the kill command
                if let Some(child) = watcher_guard.take() {
                    let _ = child.kill();
                    println!("TAURI: arduino-cli watcher successfully terminated.");
                }
            }
        });
}