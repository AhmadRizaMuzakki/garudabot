mod app;
mod arduino_cli;
mod ble;

use std::sync::{Arc, Mutex};

use tauri::Manager;

use app::state::AppState;

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
            watcher_child: Mutex::new(None),
        })
        .manage(arduino_cli::CompileJobState::default())
        .manage(ble::native::NativeBleState::default())
        .manage(app::serial_monitor::SerialMonitorState::default())
        .setup(|app| {
            let version = app.package_info().version.to_string();
            let title = format!("Garudabot {version}");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&title);
            }
            app::ports::spawn_port_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app::board::board_connect,
            app::board::board_disconnect,
            app::board::board_install_esp01_bridge,
            app::board::board_compile_and_flash,
            app::board::board_compile_ble_live,
            arduino_cli::board_compile_cancel,
            app::wifi::wifi_scan_boards,
            app::wifi::wifi_connect_board,
            app::firmata::pin_digital_write,
            app::firmata::pin_pwm_write,
            app::firmata::pin_motor_dual,
            app::firmata::pin_analog_write,
            app::firmata::pin_servo_write,
            app::firmata::pin_tone,
            app::firmata::pin_no_tone,
            app::firmata::pin_digital_read,
            app::firmata::pin_analog_read,
            app::firmata::pin_ultrasonic_read,
            app::ports::port_list,
            app::serial_monitor::serial_monitor_open,
            app::serial_monitor::serial_monitor_close,
            app::serial_monitor::serial_monitor_write,
            app::serial_monitor::serial_monitor_is_open,
            app::firmata::i2c_enable,
            app::firmata::i2c_set_cursor,
            app::firmata::i2c_clear_display,
            app::firmata::i2c_write_string,
            app::misc::file_write,
            app::misc::app_quit,
            ble::native::ble_native_status,
            ble::native::ble_native_scan,
            ble::native::ble_native_connect,
            ble::native::ble_native_write,
            ble::native::ble_native_close
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                println!("TAURI: App is exiting, cleaning up background processes...");
                let state = app_handle.state::<AppState>();
                let mut watcher_guard = state.watcher_child.lock().unwrap();

                if let Some(child) = watcher_guard.take() {
                    let _ = child.kill();
                    println!("TAURI: arduino-cli watcher successfully terminated.");
                }

                if let Some(job) = app_handle.try_state::<arduino_cli::CompileJobState>() {
                    job.request_cancel();
                }
            }
        });
}
