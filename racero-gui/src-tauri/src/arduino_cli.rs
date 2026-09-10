//! Shared helpers for invoking arduino-cli from Tauri commands.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

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

/// Path yang aman untuk `--libraries` / xtensa-g++.
///
/// Installer meletakkan library di `Program Files\Garudabot\...`. Arduino CLI
/// lalu mereport path dengan prefix `\\?\`, dan toolchain ESP32 gagal `#include`
/// meski file `.h` ada di Explorer. Mirror ke path pendek tanpa "Program Files".
pub(crate) fn append_libraries(app: &AppHandle, args: &mut Vec<String>) {
    if let Some(dir) = libraries_dir_for_cli(app) {
        let cli_path = path_for_cli(&dir);
        let _ = app.emit(
            "compiler-log",
            format!("Arduino libraries: {}\n", cli_path),
        );
        args.push("--libraries".to_string());
        args.push(cli_path);
    }
}

fn libraries_dir_for_cli(app: &AppHandle) -> Option<PathBuf> {
    let source = libraries_dir(app)?;
    let source = strip_extended_path_prefix(source);
    if !path_needs_cli_mirror(&source) {
        return Some(source);
    }
    match mirror_libraries_for_cli(&source) {
        Ok(mirrored) => {
            let _ = app.emit(
                "compiler-log",
                format!(
                    "Library di Program Files di-mirror ke path aman untuk compile:\n  {}\n",
                    mirrored.display()
                ),
            );
            Some(mirrored)
        }
        Err(e) => {
            let _ = app.emit(
                "compiler-log",
                format!(
                    "PERINGATAN: mirror library gagal ({e}); pakai path asli (bisa gagal di ESP32).\n"
                ),
            );
            Some(source)
        }
    }
}

fn path_needs_cli_mirror(path: &Path) -> bool {
    let s = path.to_string_lossy();
    let lower = s.to_ascii_lowercase();
    lower.contains("program files")
        || s.starts_with(r"\\?\")
        || s.starts_with("//?/")
}

/// Buang prefix extended path Windows supaya string yang di-pass ke CLI/g++ bersih.
fn strip_extended_path_prefix(path: PathBuf) -> PathBuf {
    let raw = path.to_string_lossy();
    if let Some(rest) = raw.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    if let Some(rest) = raw.strip_prefix("//?/") {
        return PathBuf::from(rest);
    }
    path
}

fn path_for_cli(path: &Path) -> String {
    strip_extended_path_prefix(path.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

fn mirror_cache_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    // Path tanpa spasi & tanpa Program Files — paling aman untuk -I g++.
    roots.push(PathBuf::from(r"C:\Users\Public\Garudabot\arduino-libraries"));
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(local).join("Garudabot").join("arduino-libraries"));
    }
    roots.push(std::env::temp_dir().join("Garudabot").join("arduino-libraries"));
    roots
}

fn mirror_libraries_for_cli(source: &Path) -> Result<PathBuf, String> {
    let mut last_err = None;
    for dest_root in mirror_cache_roots() {
        match sync_dir_incremental(source, &dest_root) {
            Ok(()) => return Ok(strip_extended_path_prefix(dest_root)),
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| "Gagal mirror arduino-libraries.".into()))
}

fn file_mtime(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).and_then(|m| m.modified()).ok()
}

fn sync_dir_incremental(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Buat cache library: {}: {}", dst.display(), e))?;

    let entries = fs::read_dir(src).map_err(|e| format!("Baca {}: {}", src.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let name = entry.file_name();
        let dst_path = dst.join(&name);
        let file_type = entry.file_type().map_err(|e| e.to_string())?;

        if file_type.is_dir() {
            sync_dir_incremental(&src_path, &dst_path)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }

        let needs_copy = match (file_mtime(&src_path), file_mtime(&dst_path)) {
            (Some(src_t), Some(dst_t)) => src_t > dst_t,
            (Some(_), None) => true,
            _ => true,
        };
        if needs_copy {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&src_path, &dst_path).map_err(|e| {
                format!(
                    "Copy {} → {}: {}",
                    src_path.display(),
                    dst_path.display(),
                    e
                )
            })?;
        }
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_extended_prefix() {
        let p = strip_extended_path_prefix(PathBuf::from(
            r"\\?\C:\Program Files\Garudabot\arduino-libraries",
        ));
        assert_eq!(
            p,
            PathBuf::from(r"C:\Program Files\Garudabot\arduino-libraries")
        );
    }

    #[test]
    fn program_files_needs_mirror() {
        assert!(path_needs_cli_mirror(Path::new(
            r"C:\Program Files\Garudabot\arduino-libraries"
        )));
        assert!(!path_needs_cli_mirror(Path::new(
            r"C:\Users\Public\Garudabot\arduino-libraries"
        )));
    }
}
