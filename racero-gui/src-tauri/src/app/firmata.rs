use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::Instant;

use firmata_rs::{Board, Firmata};
use serialport::SerialPort;
use tauri::State;

use crate::app::state::{AppState, DisplayState};

/// Dedup forever-loop motor writes (sama BLE live session).
pub(crate) static LAST_MOTOR: Mutex<Option<HashMap<String, i32>>> = Mutex::new(None);

fn motor_cache() -> std::sync::MutexGuard<'static, Option<HashMap<String, i32>>> {
    let mut guard = LAST_MOTOR.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    guard
}

/// SysEx MOTOR_DUAL (0x63) — dual-PWM di StandardFirmata (tanpa WeELF library).
/// Jangan 0x6D: bentrok PIN_STATE_QUERY → compile "duplicate case value".
#[tauri::command]
pub fn pin_motor_dual(
    pin1: i32,
    pin2: i32,
    speed: i32,
    state: State<AppState>,
) -> Result<(), String> {
    let speed = speed.clamp(-100, 100);
    let key = format!("{}:{}", pin1, pin2);
    {
        let mut guard = motor_cache();
        let map = guard.as_mut().unwrap();
        // Speed 0 selalu kirim (stop). Dedup hanya untuk gas sama (forever).
        if speed != 0 && map.get(&key).copied() == Some(speed) {
            return Ok(());
        }
        map.insert(key, speed);
    }

    let encoded = (speed + 100).clamp(0, 200) as u16;
    let payload = [
        firmata_rs::START_SYSEX,
        0x63, // WE_ELF_FIRMATA_MOTOR_DUAL
        (pin1 as u8) & 0x7F,
        (pin2 as u8) & 0x7F,
        (encoded as u8) & 0x7F,
        ((encoded >> 7) as u8) & 0x7F,
        firmata_rs::END_SYSEX,
    ];

    let mut tx = state.tx_connection.lock().unwrap();
    if let Some(port) = tx.as_mut() {
        port.write_all(&payload)
            .map_err(|e| format!("FIRMATA: motor dual write: {}", e))?;
        port.flush()
            .map_err(|e| format!("FIRMATA: motor dual flush: {}", e))?;
        Ok(())
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

/// Firmata ANALOG_MESSAGE hanya memuat pin 0–15 di nibble perintah.
/// Motor ELF (GPIO 16/17/19/21) wajib lewat sysex EXTENDED_ANALOG.
pub fn firmata_analog_write(
    board: &mut Board<Box<dyn SerialPort>>,
    pin: i32,
    value: i32,
) -> Result<(), String> {
    if pin < 0 {
        return Err(format!("FIRMATA: pin {} tidak valid", pin));
    }
    let pin_usize = pin as usize;
    if pin_usize >= board.pins.len() {
        return Err(format!(
            "FIRMATA: pin {} di luar jangkauan board ({} pins)",
            pin,
            board.pins.len()
        ));
    }
    let level = value.clamp(0, 16383);
    board.pins[pin_usize].value = level;

    if pin <= 15 {
        return board
            .analog_write(pin, level)
            .map_err(|e| format!("FIRMATA: failed to write to pin {}: {:?}", pin, e));
    }

    // F0 6F <pin> <lsb> <msb> F7
    let buf = [
        firmata_rs::START_SYSEX,
        firmata_rs::EXTENDED_ANALOG,
        pin as u8,
        (level as u8) & 0x7F,
        ((level >> 7) as u8) & 0x7F,
        firmata_rs::END_SYSEX,
    ];
    board
        .connection
        .write_all(&buf)
        .map_err(|e| format!("FIRMATA: extended analog pin {}: {}", pin, e))?;
    board
        .connection
        .flush()
        .map_err(|e| format!("FIRMATA: flush pin {}: {}", pin, e))?;
    Ok(())
}

#[tauri::command]
pub fn pin_digital_write(pin: i32, value: i32, state: State<AppState>) -> Result<(), String> {
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
pub fn pin_pwm_write(pin: i32, value: i32, state: State<AppState>) -> Result<(), String> {
    let mut connection_state = state.connection.lock().unwrap();

    if let Some(board) = connection_state.as_mut() {
        if pin < 0 || (pin as usize) >= board.pins.len() {
            return Err(format!("FIRMATA: pin {} tidak valid", pin));
        }
        if board.pins[pin as usize].mode != firmata_rs::PWM {
            board.set_pin_mode(pin, firmata_rs::PWM)
                .map_err(|e| format!("FIRMATA: failed to set pin {} mode: {:?}", pin, e))?;
        }

        firmata_analog_write(board, pin, value)
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
pub fn pin_analog_write(pin: i32, value: i32, state: State<AppState>) -> Result<(), String> {
    let mut connection_state = state.connection.lock().unwrap();

    if let Some(board) = connection_state.as_mut() {
        if pin < 0 || (pin as usize) >= board.pins.len() {
            return Err(format!("FIRMATA: pin {} tidak valid", pin));
        }
        if board.pins[pin as usize].mode != firmata_rs::PWM {
            board.set_pin_mode(pin, firmata_rs::PWM)
                .map_err(|e| format!("FIRMATA: failed to set pin {} mode: {:?}", pin, e))?;
        }

        firmata_analog_write(board, pin, value)
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
pub fn pin_servo_write(pin: i32, value: i32, state: State<AppState>) -> Result<(), String> {
    let mut connection_state = state.connection.lock().unwrap();

    if let Some(board) = connection_state.as_mut() {
        if pin < 0 || (pin as usize) >= board.pins.len() {
            return Err(format!("FIRMATA: pin {} tidak valid", pin));
        }
        if board.pins[pin as usize].mode != firmata_rs::SERVO {
            board.set_pin_mode(pin, firmata_rs::SERVO)
                .map_err(|e| format!("FIRMATA: failed to set pin {} mode: {:?}", pin, e))?;
        }

        firmata_analog_write(board, pin, value)
    } else {
        Err("FIRMATA: Board is not connected!".to_string())
    }
}

#[tauri::command]
pub async fn pin_tone(state: tauri::State<'_, AppState>, pin: u8, frequency: u16, duration: u16) -> Result<(), String> {
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
pub async fn pin_no_tone(state: tauri::State<'_, AppState>, pin: u8) -> Result<(), String> {
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
pub fn pin_digital_read(pin: i32, state: State<AppState>) -> Result<i32, String> {
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
pub fn pin_analog_read(pin: i32, state: State<AppState>) -> Result<i32, String> {
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
pub async fn pin_ultrasonic_read(state: tauri::State<'_, AppState>, trig: u8, echo: u8) -> Result<f32, String> {
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
pub fn i2c_enable(state: State<'_, AppState>, address: u8, kind: u8) -> Result<(), String> {
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
pub fn i2c_set_cursor(state: State<'_, AppState>, col: u8, row: u8) -> Result<(), String> {
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
pub fn i2c_clear_display(state: State<'_, AppState>) -> Result<(), String> {
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
pub fn i2c_write_string(state: State<'_, AppState>, string: String) -> Result<(), String> {
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

