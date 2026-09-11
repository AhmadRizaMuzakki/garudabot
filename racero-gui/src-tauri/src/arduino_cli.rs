//! Shared helpers for invoking arduino-cli from Tauri commands.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

/// Proses compile/upload yang sedang jalan — bisa di-kill dari tombol Cancel.
pub struct CompileJobState {
    child: Mutex<Option<CommandChild>>,
    cancelled: AtomicBool,
}

impl Default for CompileJobState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            cancelled: AtomicBool::new(false),
        }
    }
}

impl CompileJobState {
    fn clear_child(&self) {
        if let Ok(mut guard) = self.child.lock() {
            *guard = None;
        }
    }

    fn take_and_kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }

    /// Tandai cancel + kill proses (dipakai Exit app juga).
    pub fn request_cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.take_and_kill();
    }
}

/// Batalkan compile/upload yang sedang berjalan (dipanggil tombol Cancel di UI).
#[tauri::command]
pub fn board_compile_cancel(app: AppHandle, state: State<'_, CompileJobState>) -> Result<(), String> {
    state.request_cancel();
    let _ = app.emit(
        "compiler-log",
        "\nUpload dibatalkan oleh pengguna.\n",
    );
    Ok(())
}

/// Jumlah job compile paralel — di PC lama dibatasi supaya UI tidak freeze.
pub(crate) fn compile_job_count() -> usize {
    let cpus = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(2);
    if cpus <= 2 {
        1
    } else if cpus <= 4 {
        // i5 gen lama (2C/4T): 2 job — masih lebih cepat dari 1, tanpa saturasi penuh.
        2
    } else {
        // Sisakan 1 core untuk UI/OS; cap 6 agar tidak thrash RAM.
        (cpus - 1).min(6)
    }
}

/// Flag performa compile: jobs terbatas + build path stabil (cache .o).
pub(crate) fn append_compile_speed_args(args: &mut Vec<String>, build_path: Option<&Path>) {
    let jobs = compile_job_count();
    args.push("--jobs".to_string());
    args.push(jobs.to_string());
    // Kurangi kerja parsing warning (sedikit lebih ringan di toolchain lama).
    args.push("--warnings".to_string());
    args.push("none".to_string());
    if let Some(path) = build_path {
        args.push("--build-path".to_string());
        args.push(path_for_cli(path));
    }
}

/// Jalankan arduino-cli.
/// `quiet`: log ringkas untuk upload USB (tanpa dump esptool).
pub(crate) async fn run_with_logs(
    app: &AppHandle,
    args: Vec<String>,
    quiet: bool,
) -> Result<i32, String> {
    let job = app.state::<CompileJobState>();
    job.cancelled.store(false, Ordering::SeqCst);
    job.clear_child();

    if !quiet {
        let jobs = compile_job_count();
        let _ = app.emit(
            "compiler-log",
            format!("Compile jobs: {} (disesuaikan dengan CPU)\n", jobs),
        );
    } else {
        let _ = app.emit("compiler-log", "Mengompilasi...\n");
    }

    let sidecar = app
        .shell()
        .sidecar("arduino-cli")
        .map_err(|e| format!("Arduino CLI: {}", e))?;

    let mut exit_code = 0;
    let (mut rx, child) = sidecar
        .args(args)
        .spawn()
        .map_err(|e| format!("Arduino CLI: {}", e))?;

    {
        let mut guard = job
            .child
            .lock()
            .map_err(|_| "Compile job lock gagal.".to_string())?;
        *guard = Some(child);
    }

    // Batch log: flush tiap ~200ms atau buffer penuh.
    let mut log_buf = String::with_capacity(4096);
    let mut last_flush = Instant::now();
    let flush_every = Duration::from_millis(200);
    let mut quiet_progress = QuietUploadProgress::default();

    let flush = |app: &AppHandle, buf: &mut String| {
        if buf.is_empty() {
            return;
        }
        let chunk = std::mem::take(buf);
        let _ = app.emit("compiler-log", chunk);
    };

    while let Some(event) = rx.recv().await {
        if job.cancelled.load(Ordering::SeqCst) {
            flush(app, &mut log_buf);
            job.clear_child();
            return Err("Upload dibatalkan.".to_string());
        }
        match event {
            CommandEvent::Stdout(line_bytes) | CommandEvent::Stderr(line_bytes) => {
                let line = String::from_utf8_lossy(&line_bytes);
                if quiet {
                    if let Some(msg) = quiet_progress.map_line(&line) {
                        log_buf.push_str(&msg);
                    }
                } else {
                    log_buf.push_str(&line);
                    if !line.ends_with('\n') {
                        log_buf.push('\n');
                    }
                }
                if last_flush.elapsed() >= flush_every || log_buf.len() >= 4096 {
                    flush(app, &mut log_buf);
                    last_flush = Instant::now();
                }
            }
            CommandEvent::Terminated(payload) => {
                flush(app, &mut log_buf);
                exit_code = payload.code.unwrap_or(-1);
                if !job.cancelled.load(Ordering::SeqCst) {
                    if quiet {
                        if exit_code == 0 {
                            let _ = app.emit("compiler-log", "Selesai.\n");
                        } else {
                            let _ = app.emit(
                                "compiler-log",
                                format!("Gagal (kode {}).\n", exit_code),
                            );
                        }
                    } else {
                        let status = format!("\nProcess finished with code: {:?}", payload.code);
                        let _ = app.emit("compiler-log", status);
                    }
                }
            }
            _ => {}
        }
    }

    flush(app, &mut log_buf);
    job.clear_child();
    if job.cancelled.load(Ordering::SeqCst) {
        return Err("Upload dibatalkan.".to_string());
    }
    Ok(exit_code)
}

/// Filter log upload USB → beberapa baris status saja.
#[derive(Default)]
struct QuietUploadProgress {
    compiling: bool,
    connected: bool,
    uploading: bool,
}

impl QuietUploadProgress {
    fn map_line(&mut self, line: &str) -> Option<String> {
        let t = line.trim();
        if t.is_empty() {
            return None;
        }
        let lower = t.to_ascii_lowercase();

        // Error / warning penting selalu tampil.
        if lower.contains("error:")
            || lower.contains("error ")
            || lower.contains("failed")
            || lower.contains("fatal")
            || lower.contains("traceback")
            || lower.contains("permission denied")
            || lower.contains("could not open")
            || lower.contains("timed out")
            || lower.contains("no serial data")
            || lower.contains("wrong boot mode")
        {
            return Some(format!("{}\n", t));
        }

        if !self.compiling
            && (lower.contains("compiling sketch")
                || (lower.contains("library") && lower.contains("detected"))
                || lower.starts_with("sketch uses"))
        {
            self.compiling = true;
            // "Mengompilasi..." sudah di-emit di awal; skip spam.
            if lower.starts_with("sketch uses") {
                // Satu baris ukuran sketch — berguna & singkat.
                return Some(format!("{}\n", t));
            }
            return None;
        }

        if !self.connected
            && (lower.contains("connecting")
                || lower.contains("connected to")
                || lower.contains("serial port"))
        {
            if lower.contains("connecting") || lower.contains("connected to") {
                self.connected = true;
                return Some("Menghubungkan ke board...\n".into());
            }
            return None;
        }

        if !self.uploading
            && (lower.contains("writing at")
                || lower.contains("uploading")
                || lower.contains("flashing")
                || lower.contains("writing '"))
        {
            self.uploading = true;
            return Some("Mengunggah firmware...\n".into());
        }

        None
    }
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
    append_libraries_with_log(app, args, true);
}

pub(crate) fn append_libraries_quiet(app: &AppHandle, args: &mut Vec<String>) {
    append_libraries_with_log(app, args, false);
}

fn append_libraries_with_log(app: &AppHandle, args: &mut Vec<String>, log_path: bool) {
    if let Some(dir) = libraries_dir_for_cli(app) {
        let cli_path = path_for_cli(&dir);
        if log_path {
            let _ = app.emit(
                "compiler-log",
                format!("Arduino libraries: {}\n", cli_path),
            );
        }
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

    #[test]
    fn compile_jobs_at_least_one() {
        assert!(compile_job_count() >= 1);
    }
}
