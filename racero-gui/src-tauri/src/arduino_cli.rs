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

/// Mode log ringkas: bedakan phase supaya teks tidak bilang "mengompilasi" saat upload.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum QuietPhase {
    /// Log penuh (dev / non-USB).
    Verbose,
    Compile,
    Upload,
}

/// Jalankan arduino-cli.
pub(crate) async fn run_with_logs(
    app: &AppHandle,
    args: Vec<String>,
    phase: QuietPhase,
) -> Result<i32, String> {
    let quiet = phase != QuietPhase::Verbose;
    let job = app.state::<CompileJobState>();
    job.cancelled.store(false, Ordering::SeqCst);
    job.clear_child();

    match phase {
        QuietPhase::Verbose => {
            let jobs = compile_job_count();
            let _ = app.emit(
                "compiler-log",
                format!("Compile jobs: {} (disesuaikan dengan CPU)\n", jobs),
            );
        }
        QuietPhase::Compile => {
            let _ = app.emit("compiler-log", "Mengompilasi...\n");
        }
        QuietPhase::Upload => {
            // "Upload ke COMx..." sudah di-emit pemanggil.
        }
    }

    let sidecar = app
        .shell()
        .sidecar("arduino-cli")
        .map_err(|e| format!("Arduino CLI: {}", e))?;

    // Isolasi sketchbook: Documents/Arduino/libraries (mis. ESP32Servo) sering
    // bentrok header dengan bundel weeecode (ESP32PWM). Pakai user dir kosong
    // + --libraries dari append_libraries saja.
    let isolated_user = isolated_sketchbook_dir();
    let mut exit_code = 0;
    let (mut rx, child) = sidecar
        .env("ARDUINO_DIRECTORIES_USER", &isolated_user)
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
    let mut heartbeat = tokio::time::interval(Duration::from_secs(12));
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    heartbeat.tick().await;
    let mut heartbeat_n: u32 = 0;

    let flush = |app: &AppHandle, buf: &mut String| {
        if buf.is_empty() {
            return;
        }
        let chunk = std::mem::take(buf);
        let _ = app.emit("compiler-log", chunk);
    };

    loop {
        if job.cancelled.load(Ordering::SeqCst) {
            flush(app, &mut log_buf);
            job.clear_child();
            return Err("Upload dibatalkan.".to_string());
        }

        tokio::select! {
            event = rx.recv() => {
                let Some(event) = event else { break; };
                match event {
                    CommandEvent::Stdout(line_bytes) | CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        if quiet {
                            if let Some(msg) = quiet_progress.map_line(&line, phase) {
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
                                    let done = match phase {
                                        QuietPhase::Compile => "Compile selesai.\n",
                                        QuietPhase::Upload => "Flash selesai.\n",
                                        QuietPhase::Verbose => "Selesai.\n",
                                    };
                                    let _ = app.emit("compiler-log", done);
                                } else {
                                    let _ = app.emit(
                                        "compiler-log",
                                        format!("Gagal (kode {}).\n", exit_code),
                                    );
                                }
                            } else {
                                let status =
                                    format!("\nProcess finished with code: {:?}", payload.code);
                                let _ = app.emit("compiler-log", status);
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ = heartbeat.tick(), if quiet => {
                heartbeat_n += 1;
                let msg = match phase {
                    QuietPhase::Compile => {
                        format!("…masih mengompilasi ({})\n", heartbeat_n)
                    }
                    QuietPhase::Upload => {
                        format!("…masih mengunggah ({})\n", heartbeat_n)
                    }
                    QuietPhase::Verbose => String::new(),
                };
                if !msg.is_empty() {
                    let _ = app.emit("compiler-log", msg);
                }
            }
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
    sketch_size: bool,
    connected: bool,
    uploading: bool,
}

impl QuietUploadProgress {
    fn map_line(&mut self, line: &str, phase: QuietPhase) -> Option<String> {
        let t = line.trim();
        if t.is_empty() {
            return None;
        }
        let lower = t.to_ascii_lowercase();

        // Noise esptool Windows — bukan error sungguhan.
        if lower.contains("failed to get vid/pid")
            || lower.contains("using standard reset sequence")
            || lower.contains("stub running")
            || lower.contains("changing baud")
            || lower.contains("configuring flash")
            || lower.contains("flash will be erased")
            || lower.contains("compressed")
            || lower.contains("hash of data verified")
            || lower.contains("hard resetting")
        {
            return None;
        }

        // Error penting (setelah filter noise di atas).
        if lower.contains("error:")
            || lower.contains(" fatal")
            || lower.starts_with("fatal")
            || lower.contains("traceback")
            || lower.contains("permission denied")
            || lower.contains("could not open")
            || lower.contains("timed out")
            || lower.contains("no serial data")
            || lower.contains("wrong boot mode")
            || (lower.contains("failed") && !lower.contains("vid/pid"))
        {
            return Some(format!("{}\n", t));
        }

        if phase == QuietPhase::Compile
            && !self.sketch_size
            && lower.starts_with("sketch uses")
        {
            self.sketch_size = true;
            // Ringkas: "Sketch uses 1256822 bytes (63%) of program storage..."
            if let Some(pct) = lower.split('(').nth(1).and_then(|s| s.split(')').next()) {
                return Some(format!("Ukuran firmware: {}\n", pct.trim()));
            }
            return Some(format!("{}\n", t));
        }

        if phase == QuietPhase::Upload && !self.connected
            && (lower.contains("connecting") || lower.contains("connected to"))
        {
            self.connected = true;
            return Some("Menghubungkan ke board...\n".into());
        }

        if phase == QuietPhase::Upload
            && !self.uploading
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

/// Sketchbook kosong agar library user (Documents/Arduino/libraries) tidak
/// ikut di-resolve saat compile — cegah konflik ESP32Servo vs weeecode.
pub(crate) fn isolated_sketchbook_dir() -> String {
    let root = if let Ok(local) = std::env::var("LOCALAPPDATA") {
        PathBuf::from(local).join("Garudabot").join("arduino-sketchbook")
    } else {
        std::env::temp_dir()
            .join("Garudabot")
            .join("arduino-sketchbook")
    };
    let libraries = root.join("libraries");
    let _ = fs::create_dir_all(&libraries);
    path_for_cli(&root)
}

fn isolated_libraries_dir() -> PathBuf {
    PathBuf::from(isolated_sketchbook_dir()).join("libraries")
}

fn lib_header_exists(lib_dir_name: &str, header: &str) -> bool {
    let root = isolated_libraries_dir();
    let candidates = [
        root.join(lib_dir_name).join(header),
        root.join(lib_dir_name).join("src").join(header),
        root.join(lib_dir_name.to_ascii_lowercase()).join(header),
        root.join(lib_dir_name.to_ascii_lowercase())
            .join("src")
            .join(header),
    ];
    candidates.iter().any(|p| p.is_file())
}

/// Pastikan library untuk StandardFirmata / Live Mode USB ada di sketchbook
/// terisolasi (bukan Documents — biar tidak bentrok ESP32Servo vs weeecode).
pub(crate) async fn ensure_live_mode_libraries(app: &AppHandle) -> Result<(), String> {
    // Firmata dari fork zacknuv (Boards.h ESP32). Lainnya dari Library Manager.
    struct Need {
        folder: &'static str,
        header: &'static str,
        install_args: &'static [&'static str],
        label: &'static str,
    }
    let needs = [
        Need {
            folder: "Firmata",
            header: "Firmata.h",
            install_args: &["lib", "install", "--git-url", "https://github.com/zacknuv/firmata.git"],
            label: "Firmata",
        },
        Need {
            folder: "ESP32Servo",
            header: "ESP32Servo.h",
            // Official library (ESP32 core 3.x). Jangan pakai copy lama di weeecode.
            install_args: &["lib", "install", "ESP32Servo"],
            label: "ESP32Servo",
        },
        Need {
            folder: "SSD1306Ascii",
            header: "SSD1306Ascii.h",
            install_args: &["lib", "install", "SSD1306Ascii"],
            label: "SSD1306Ascii",
        },
        Need {
            folder: "LiquidCrystal_I2C",
            header: "LiquidCrystal_I2C.h",
            install_args: &["lib", "install", "LiquidCrystal_I2C"],
            label: "LiquidCrystal_I2C",
        },
    ];

    let missing: Vec<&Need> = needs
        .iter()
        .filter(|n| !lib_header_exists(n.folder, n.header))
        .collect();
    if missing.is_empty() {
        return Ok(());
    }

    let _ = app.emit(
        "compiler-log",
        format!(
            "Menginstal library Live Mode: {}...\n",
            missing
                .iter()
                .map(|n| n.label)
                .collect::<Vec<_>>()
                .join(", ")
        ),
    );

    // git-url butuh flag unsafe.
    let _ = run_arduino_cli_env(
        app,
        vec![
            "config".into(),
            "set".into(),
            "library.enable_unsafe_install".into(),
            "true".into(),
        ],
        true,
    )
    .await;

    for need in missing {
        let code = run_arduino_cli_env(
            app,
            need.install_args.iter().map(|s| (*s).to_string()).collect(),
            true,
        )
        .await?;
        if code != 0 && !lib_header_exists(need.folder, need.header) {
            return Err(format!(
                "Gagal menginstal library {} (exit {}). Cek koneksi internet.",
                need.label, code
            ));
        }
    }
    Ok(())
}

/// Jalankan arduino-cli sekali (output diam) dengan sketchbook terisolasi.
async fn run_arduino_cli_env(
    app: &AppHandle,
    args: Vec<String>,
    quiet: bool,
) -> Result<i32, String> {
    let sidecar = app
        .shell()
        .sidecar("arduino-cli")
        .map_err(|e| format!("Arduino CLI: {}", e))?;
    let isolated_user = isolated_sketchbook_dir();
    let output = sidecar
        .env("ARDUINO_DIRECTORIES_USER", &isolated_user)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Arduino CLI: {}", e))?;
    if !quiet {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !stderr.trim().is_empty() {
            let _ = app.emit("compiler-log", format!("{}\n", stderr));
        }
    }
    Ok(output.status.code().unwrap_or(-1))
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

/// Opsi FQBN ESP32: baud upload aman + partition lebih besar + hemat flash.
/// min_spiffs ≈ APP 1.9MB; DebugLevel=none mengurangi string log di binary.
pub(crate) fn fqbn_with_safe_upload_speed(fqbn: &str) -> String {
    if !fqbn.contains("esp32") {
        return fqbn.to_string();
    }

    let mut out = fqbn.to_string();
    out = append_fqbn_option(&out, "UploadSpeed", "115200");
    out = append_fqbn_option(&out, "PartitionScheme", "min_spiffs");
    out = append_fqbn_option(&out, "DebugLevel", "none");
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
