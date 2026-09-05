//! Shared helpers for invoking arduino-cli from Tauri commands.

use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

pub(crate) async fn run_with_logs(app: &AppHandle, args: Vec<String>) -> Result<i32, String> {
    let sidecar = app
        .shell()
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

pub(crate) fn libraries_dir(app: &AppHandle) -> Option<PathBuf> {
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

pub(crate) fn append_libraries(app: &AppHandle, args: &mut Vec<String>) {
    if let Some(dir) = libraries_dir(app) {
        args.push("--libraries".to_string());
        args.push(dir.to_string_lossy().into_owned());
    }
}

/// Opsi FQBN ESP32: baud upload aman + partition lebih besar.
/// FQBN options untuk ESP32 + BLE OTA: upload baud aman + partition min_spiffs
/// (APP ~1.9MB) supaya sketch + GarudabotBleOta + library motor muat.
pub(crate) fn fqbn_with_safe_upload_speed(fqbn: &str) -> String {
    if !fqbn.contains("esp32") {
        return fqbn.to_string();
    }

    let mut out = fqbn.to_string();
    out = append_fqbn_option(&out, "UploadSpeed", "115200");
    out = append_fqbn_option(&out, "PartitionScheme", "min_spiffs");
    out
}

fn append_fqbn_option(fqbn: &str, key: &str, value: &str) -> String {
    let marker = format!("{}=", key);
    if fqbn.contains(&marker) {
        return fqbn.to_string();
    }
    let option = format!("{}={}", key, value);
    // esp32:esp32:esp32  → opsi pertama pakai ':'
    // esp32:esp32:esp32:UploadSpeed=… → opsi berikutnya pakai ','
    if fqbn.matches(':').count() >= 3 {
        format!("{},{}", fqbn, option)
    } else {
        format!("{}:{}", fqbn, option)
    }
}
