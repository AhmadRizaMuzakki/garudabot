use std::fs;
use std::io::Read;
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

#[tauri::command]
async fn board_compile_and_flash(app: AppHandle, code: String, fqbn: String, port: String) -> Result<String, String> {
    let sketch_name = "racero_project";

    let mut sketch_dir = std::env::temp_dir();
    sketch_dir.push(sketch_name);
    if !sketch_dir.exists() {
        fs::create_dir_all(&sketch_dir).map_err(|e| format!("Arduino CLI: {}", e))?;
    }

    let sketch_file_path = sketch_dir.join(format!("{}.ino", sketch_name));
    fs::write(&sketch_file_path, code).map_err(|e| format!("Arduino CLI: {}", e))?;

    let mut args = vec![
        "compile",
        "--upload",
        "--fqbn",
        &fqbn,
        "--port",
        &port,
        sketch_dir.to_str().unwrap(),
    ];

    if fqbn == "racero:avr:32:hunaupload=enabled" {
        args.push("--build-property");
        args.push("compiler.cpp.extra_flags=-DTIMSK1=TIMSK -DTIFR1=TIFR");
    }

    let sidecar = app.shell()
        .sidecar("arduino-cli")
        .map_err(|e| format!("Arduino CLI: {}", e))?;
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
                let status = format!("\nProcess finished with code: {:?}", payload.code);
                let _ = app.emit("compiler-log", status);
            }
            _ => {}
        }
    }

    Ok("Compilation cycle complete.".to_string())
}

#[tauri::command]
async fn port_list(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let is_empty = {
        let ports = state.detected_ports.lock().unwrap();
        ports.is_empty()
    };

    let output = if is_empty {
        let result = app.shell()
            .sidecar("arduino-cli")
            .unwrap()
            .args(["board", "list", "--format", "json"])
            .output()
            .await
            .map_err(|e| e.to_string())?;
        String::from_utf8_lossy(&result.stdout).to_string()
    } else {
        let ports = state.detected_ports.lock().unwrap();
        serde_json::json!({ "detected_ports": *ports }).to_string()
    };

    Ok(output)
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
                                    if !ports_list.iter().any(|p| p["address"] == incoming_port["address"]) {
                                        ports_list.push(incoming_port.clone());
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