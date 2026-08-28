use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::time::Instant;
use std::sync::{Arc, Mutex};

use serialport::{SerialPort, ClearBuffer, DataBits, Parity, StopBits, FlowControl};
use firmata_rs::{Board, Firmata};

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{ShellExt, process::{CommandEvent, CommandChild}};

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

fn is_network_ota_port(port: &str) -> bool {
    is_ipv4_address(port)
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
    let sidecar = app.shell()
        .sidecar("arduino-cli")
        .map_err(|e| format!("Arduino CLI: {}", e))?;

    let mut exit_code = 0;
    let (mut rx, _child) = sidecar
        .args(args)
        .spawn()
        .map_err(|e| format!("Arduino CLI: {}", e))?;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line_bytes) => {
                let line = String::from_utf8_lossy(&line_bytes).to_string();
                let _ = app.emit("compiler-log", line);
            }
            CommandEvent::Stderr(line_bytes) => {
                let line = String::from_utf8_lossy(&line_bytes).to_string();
                let _ = app.emit("compiler-log", line);
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code.unwrap_or(-1);
                let status = format!("\nProcess finished with code: {:?}", payload.code);
                let _ = app.emit("compiler-log", status);
            }
            _ => {}
        }
    }

    Ok(exit_code)
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

fn arduino_libraries_dir(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("arduino-libraries"));
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("arduino-libraries"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("arduino-libraries"));
            candidates.push(dir.join("src-tauri/arduino-libraries"));
        }
    }
    candidates.push(PathBuf::from("arduino-libraries"));
    candidates.into_iter().find(|p| p.is_dir())
}

fn append_arduino_libraries(app: &AppHandle, args: &mut Vec<String>) {
    if let Some(dir) = arduino_libraries_dir(app) {
        args.push("--libraries".to_string());
        args.push(dir.to_string_lossy().into_owned());
    }
}

fn escape_arduino_string(input: &str) -> String {
    input.replace('\\', "\\\\").replace('\"', "\\\"")
}

fn augment_esp32_ota_sketch(code: &str, ota_password: &str) -> String {
    let mut sketch = code.to_string();

    if !sketch.contains("#include <WiFi.h>") {
        sketch = format!("#include <WiFi.h>\n{}", sketch);
    }
    if !sketch.contains("#include <ArduinoOTA.h>") {
        sketch = format!("#include <ArduinoOTA.h>\n{}", sketch);
    }

    let escaped_password = escape_arduino_string(ota_password);
    let setup_injection = format!(
        "\n    WiFi.mode(WIFI_AP_STA);\n    WiFi.softAP(\"ELF-ESP32-Motor\", \"12345678\");\n    ArduinoOTA.setHostname(\"ELF-ESP32-Motor\");\n    ArduinoOTA.setPassword(\"{}\");\n    ArduinoOTA.begin();\n",
        escaped_password
    );

    if !sketch.contains("ArduinoOTA.begin()") {
        sketch = sketch.replacen("void setup() {", &format!("void setup() {{{}", setup_injection), 1);
    }

    if !sketch.contains("ArduinoOTA.handle()") {
        sketch = sketch.replacen("void loop() {", "void loop() {\n    ArduinoOTA.handle();\n", 1);
    }

    sketch
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
    let password_input = ota_password.unwrap_or_default();
    let password = if is_esp32 {
        let trimmed = password_input.trim();
        if trimmed.is_empty() {
            "admin".to_string()
        } else {
            trimmed.to_string()
        }
    } else {
        password_input
    };
    let sketch_code = if is_esp32 {
        augment_esp32_ota_sketch(&code, &password)
    } else {
        code
    };
    fs::write(&sketch_file_path, sketch_code).map_err(|e| format!("Arduino CLI: {}", e))?;

    let sketch_path = sketch_dir.to_str().unwrap().to_string();
    let (upload_port, extra_args) = normalize_upload_port(&port, &fqbn, &password);
    let is_esp32_ota = fqbn.contains("esp32") && is_ipv4_address(&upload_port);

    if is_esp32_ota {
        let _ = app.emit(
            "compiler-log",
            format!(
                "Upload OTA ESP32 ke {} — pastikan PC join hotspot ESP32 (bukan jalur ESP-01).\n",
                upload_port
            ),
        );

        // compile --upload tidak mendukung --upload-field (password OTA).
        // Compile dulu, lalu upload terpisah dengan password non-interaktif.
        let build_path = sketch_dir.join("build");
        let build_path_str = build_path.to_str().unwrap().to_string();

        let mut compile_args = vec![
            "compile".to_string(),
            "--fqbn".to_string(),
            fqbn.clone(),
            "--build-path".to_string(),
            build_path_str.clone(),
        ];
        append_arduino_libraries(&app, &mut compile_args);
        compile_args.push(sketch_path.clone());
        if fqbn == "racero:avr:32:hunaupload=enabled" {
            compile_args.push("--build-property".to_string());
            compile_args.push("compiler.cpp.extra_flags=-DTIMSK1=TIMSK -DTIFR1=TIFR".to_string());
        }

        let compile_code = run_arduino_cli_with_logs(&app, compile_args).await?;
        if compile_code != 0 {
            return Err(format!("Compile gagal (exit code {}).", compile_code));
        }

        let _ = app.emit("compiler-log", "Compile OK. Mengirim OTA...\n");

        let mut upload_args = vec![
            "upload".to_string(),
            "--fqbn".to_string(),
            fqbn.clone(),
            "--port".to_string(),
            upload_port.clone(),
            "--input-dir".to_string(),
            build_path_str,
        ];
        upload_args.extend(extra_args);

        let upload_code = run_arduino_cli_with_logs(&app, upload_args).await?;
        if upload_code != 0 {
            return Err(format!(
                "Upload OTA gagal (exit code {}).\n\
                 Tips OTA ESP32:\n\
                 - PC join hotspot ESP32\n\
                 - Firmware sudah aktifkan ArduinoOTA\n\
                 - Isi Password OTA di Connect WiFi (firmware ELF biasanya admin / 12345678, bukan kosong)",
                upload_code
            ));
        }

        return Ok("Compilation cycle complete.".to_string());
    }

    let mut args = vec![
        "compile".to_string(),
        "--upload".to_string(),
        "--fqbn".to_string(),
        fqbn.clone(),
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
        } else if is_network_ota_port(&upload_port) {
            "\nTips OTA ESP32: PC harus satu jaringan dengan ESP32 dan firmware sudah ada ArduinoOTA."
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
            app_quit
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