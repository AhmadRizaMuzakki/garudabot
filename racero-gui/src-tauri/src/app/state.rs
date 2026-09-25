use std::sync::{Arc, Mutex};

use serialport::SerialPort;
use tauri_plugin_shell::process::CommandChild;

pub(crate) struct DisplayState {
    pub address: u8,
    pub kind: u8,
}

pub(crate) struct FirmwareConfig {
    pub wifi_support: bool,
    pub bluetooth_support: bool,
    pub ble_support: bool,
}

pub(crate) struct AppState {
    pub firmware_config: Mutex<Option<FirmwareConfig>>,
    pub connection: Arc<Mutex<Option<firmata_rs::Board<Box<dyn SerialPort>>>>>,
    pub tx_connection: Arc<Mutex<Option<Box<dyn SerialPort>>>>,
    pub detected_ports: Arc<Mutex<Vec<serde_json::Value>>>,
    pub display: Mutex<Option<DisplayState>>,
    pub watcher_child: Mutex<Option<CommandChild>>,
}
