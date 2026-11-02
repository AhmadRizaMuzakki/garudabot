//! Uploader bootloader pabrik MRT 3 / MY ROBOT TIME (MaroRobotTech).
//!
//! Hasil reverse engineering `MY ROBOT TIME.exe` (frm_download.DownloadProgram):
//! protokol AVR109/butterfly yang disederhanakan, 115200 8N1 tanpa handshake.
//!
//! 1. Kirim `#` tiap 100 ms sampai board (setelah user tekan reset) menjawab
//!    `MRT\r`, `SRC\r`, atau `?`.
//! 2. `ESC S`  → identitas bootloader, harus diawali `SB01MRT` atau `SRCBOOT`.
//! 3. `V`      → versi (diabaikan).
//! 4. `T t`    → pilih device, balasan `\r`.
//! 5. `b`      → dukungan blok, balasan `Y hi lo` (ukuran blok, biasanya 128).
//! 6. `e`      → hapus chip, balasan `\r`.
//! 7. `A 0 0`  → alamat 0, balasan `\r`.
//! 8. Berulang: `B hi lo F <data>` per blok, balasan `\r` tiap blok.
//! 9. Tutup port; user menekan reset lagi untuk menjalankan program.
//!
//! Data flash = isi Intel HEX yang diratakan dari alamat 0 (celah diisi 0).

use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use serialport::{ClearBuffer, DataBits, FlowControl, Parity, SerialPort, StopBits};
use tauri::{AppHandle, Emitter, Manager};

use crate::arduino_cli::CompileJobState;

/// Nama event Tauri untuk dialog Download bergaya MRT di frontend.
pub const EVENT_NAME: &str = "mrt-download";

#[derive(Serialize, Clone)]
pub struct MrtDownloadEvent {
    /// `wait_reset` | `downloading` | `fallback` | `done` | `error`
    pub stage: &'static str,
    pub progress: u32,
    pub total: u32,
    pub message: String,
}

pub fn emit_stage(app: &AppHandle, stage: &'static str, progress: u32, total: u32, message: &str) {
    let _ = app.emit(
        EVENT_NAME,
        MrtDownloadEvent {
            stage,
            progress,
            total,
            message: message.to_string(),
        },
    );
}

/// Hasil percobaan upload lewat bootloader MRT.
pub enum MrtOutcome {
    /// Program masuk ke board.
    Flashed,
    /// Tidak ada bootloader MRT yang menjawab `#` dalam batas waktu.
    NoBootloader,
}

/// Error upload MRT. `Cancelled` dipisah agar UI tidak menampilkan dialog error.
#[derive(Debug)]
pub enum MrtError {
    Cancelled,
    Hex(String),
    Comm(String),
}

impl std::fmt::Display for MrtError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MrtError::Cancelled => write!(f, "Upload dibatalkan."),
            MrtError::Hex(m) => write!(f, "HEX error: {}", m),
            MrtError::Comm(m) => write!(f, "{}", m),
        }
    }
}

/// Ratakan Intel HEX menjadi byte array dari alamat 0 (sama seperti LoadHexFile di MRT).
pub fn parse_intel_hex(text: &str) -> Result<Vec<u8>, String> {
    let mut image: Vec<u8> = Vec::new();
    let mut upper: u32 = 0;

    for (line_no, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if !line.starts_with(':') {
            return Err(format!("baris {} tidak diawali ':'", line_no + 1));
        }
        let hex = &line[1..];
        if hex.len() < 10 || hex.len() % 2 != 0 {
            return Err(format!("baris {} terlalu pendek", line_no + 1));
        }
        let bytes: Result<Vec<u8>, _> = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16))
            .collect();
        let bytes = bytes.map_err(|_| format!("baris {} bukan heksadesimal", line_no + 1))?;

        let len = bytes[0] as usize;
        if bytes.len() != len + 5 {
            return Err(format!("panjang record baris {} salah", line_no + 1));
        }
        let sum: u8 = bytes.iter().fold(0u8, |acc, b| acc.wrapping_add(*b));
        if sum != 0 {
            return Err(format!("checksum baris {} salah", line_no + 1));
        }

        let addr = ((bytes[1] as u32) << 8) | bytes[2] as u32;
        let kind = bytes[3];
        let data = &bytes[4..4 + len];
        match kind {
            0x00 => {
                let start = (upper + addr) as usize;
                let end = start + len;
                if end > image.len() {
                    image.resize(end, 0);
                }
                image[start..end].copy_from_slice(data);
            }
            0x01 => break,
            0x02 => {
                if len != 2 {
                    return Err("record segment address rusak".to_string());
                }
                upper = (((data[0] as u32) << 8) | data[1] as u32) << 4;
            }
            0x04 => {
                if len != 2 {
                    return Err("record linear address rusak".to_string());
                }
                upper = (((data[0] as u32) << 8) | data[1] as u32) << 16;
            }
            0x03 | 0x05 => {}
            other => return Err(format!("tipe record 0x{:02X} tidak didukung", other)),
        }
    }

    if image.is_empty() {
        return Err("HEX kosong".to_string());
    }
    Ok(image)
}

fn open_port(port: &str) -> Result<Box<dyn SerialPort>, String> {
    let name = port.trim_start_matches(r"\\.\").to_string();
    serialport::new(&name, 115_200)
        .data_bits(DataBits::Eight)
        .parity(Parity::None)
        .stop_bits(StopBits::One)
        .flow_control(FlowControl::None)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| format!("Port {} tidak bisa dibuka: {}", name, e))
}

/// Baca semua byte yang tersedia (non-blocking).
fn read_available(port: &mut Box<dyn SerialPort>) -> Vec<u8> {
    let n = port.bytes_to_read().unwrap_or(0) as usize;
    if n == 0 {
        return Vec::new();
    }
    let mut buf = vec![0u8; n];
    match port.read(&mut buf) {
        Ok(read) => {
            buf.truncate(read);
            buf
        }
        Err(_) => Vec::new(),
    }
}

/// Kumpulkan balasan sampai `min_len` terpenuhi atau idle/timeout.
fn read_reply(port: &mut Box<dyn SerialPort>, min_len: usize, timeout: Duration) -> Vec<u8> {
    let start = Instant::now();
    let mut out: Vec<u8> = Vec::new();
    let mut last_rx = Instant::now();
    loop {
        let chunk = read_available(port);
        if !chunk.is_empty() {
            out.extend_from_slice(&chunk);
            last_rx = Instant::now();
        }
        if out.len() >= min_len && last_rx.elapsed() >= Duration::from_millis(30) {
            break;
        }
        if start.elapsed() >= timeout {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    out
}

fn send(port: &mut Box<dyn SerialPort>, bytes: &[u8]) -> Result<(), MrtError> {
    port.write_all(bytes)
        .and_then(|_| port.flush())
        .map_err(|e| MrtError::Comm(format!("Gagal kirim ke board: {}", e)))
}

fn expect_cr(
    port: &mut Box<dyn SerialPort>,
    cmd: &[u8],
    label: &str,
    timeout: Duration,
) -> Result<(), MrtError> {
    send(port, cmd)?;
    let reply = read_reply(port, 1, timeout);
    if reply.first() == Some(&b'\r') {
        Ok(())
    } else {
        Err(MrtError::Comm(format!(
            "Board tidak menjawab perintah {} (balasan: {:?}).",
            label, reply
        )))
    }
}

fn check_cancel(job: &CompileJobState) -> Result<(), MrtError> {
    if job.is_cancelled() {
        Err(MrtError::Cancelled)
    } else {
        Ok(())
    }
}

/// Jumlah maksimal pengiriman `#` (MY ROBOT TIME: 100 putaran × 100 ms ≈ 10 detik).
const MAX_SYNC_TRIES: u32 = 100;

/// Hasil tahap sinkronisasi `#`.
enum SyncReply {
    /// `MRT\r`, `SRC\r`, atau `?` — bootloader MRT siap.
    Bootloader,
    /// 100 kali `#` tanpa satu byte pun kembali.
    Silent,
    /// Ada byte, tetapi bukan balasan bootloader (program user masih jalan, dsb.).
    Unknown(Vec<u8>),
}

/// Tahap 1 — sama persis dengan DownloadProgram:
/// kirim `#` hanya bila buffer kosong, tidur 100 ms, cek balasan.
/// Diterima hanya tepat `MRT\r` (4 byte), `SRC\r` (4 byte), atau `?` (1 byte).
fn sync_bootloader(
    port: &mut Box<dyn SerialPort>,
    job: &CompileJobState,
) -> Result<SyncReply, MrtError> {
    for _ in 0..MAX_SYNC_TRIES {
        check_cancel(job)?;
        if port.bytes_to_read().unwrap_or(0) == 0 {
            send(port, b"#")?;
        }
        thread::sleep(Duration::from_millis(100));
        if port.bytes_to_read().unwrap_or(0) == 0 {
            continue;
        }
        // Beri sedikit waktu agar "MRT\r" lengkap bila datang terpisah.
        let reply = read_reply(port, 4, Duration::from_millis(100));
        let ok = matches!(reply.as_slice(), b"MRT\r" | b"SRC\r" | b"?");
        return Ok(if ok {
            SyncReply::Bootloader
        } else {
            SyncReply::Unknown(reply)
        });
    }
    Ok(SyncReply::Silent)
}

fn flash_blocking(app: &AppHandle, port_name: &str, image: &[u8]) -> Result<MrtOutcome, MrtError> {
    let job = app.state::<CompileJobState>();

    // Seperti aplikasi asli: 115200 8N1, tanpa handshake, tanpa menyentuh DTR/RTS,
    // lalu diam 300 ms sebelum mulai mengirim '#'.
    let mut port = open_port(port_name).map_err(MrtError::Comm)?;
    thread::sleep(Duration::from_millis(300));

    emit_stage(app, "wait_reset", 0, 0, "Please press reset button...");
    match sync_bootloader(&mut port, &job)? {
        SyncReply::Bootloader => {}
        SyncReply::Silent => return Ok(MrtOutcome::NoBootloader),
        SyncReply::Unknown(bytes) => {
            return Err(MrtError::Comm(format!(
                "Board menjawab '#' dengan {:?} ({} byte), bukan MRT/SRC/?. \
                 Tekan reset board saat dialog menunggu.",
                String::from_utf8_lossy(&bytes),
                bytes.len()
            )));
        }
    }

    emit_stage(app, "downloading", 0, 0, "Downloading...");
    thread::sleep(Duration::from_millis(100));

    // ESC S → identitas bootloader.
    send(&mut port, &[0x1B, b'S'])?;
    let ident = read_reply(&mut port, 7, Duration::from_millis(600));
    let ident_text = String::from_utf8_lossy(&ident).to_string();
    if !(ident_text.starts_with("SB01MRT") || ident_text.starts_with("SRCBOOT")) {
        return Err(MrtError::Comm(format!(
            "Bootloader tidak dikenal (balasan: {:?}).",
            ident_text
        )));
    }
    check_cancel(&job)?;

    // V → versi, diabaikan.
    thread::sleep(Duration::from_millis(100));
    send(&mut port, b"V")?;
    let _ = read_reply(&mut port, 2, Duration::from_millis(400));

    // T t → pilih device. Balasan kosong biasanya byte yang telat, jadi
    // buffer dikosongkan dulu dan perintah diulang sekali.
    thread::sleep(Duration::from_millis(150));
    let _ = port.clear(ClearBuffer::Input);
    if expect_cr(&mut port, b"Tt", "T", Duration::from_millis(1500)).is_err() {
        thread::sleep(Duration::from_millis(100));
        let _ = port.clear(ClearBuffer::Input);
        expect_cr(&mut port, b"Tt", "T", Duration::from_millis(1500))?;
    }
    check_cancel(&job)?;

    // b → ukuran blok.
    thread::sleep(Duration::from_millis(100));
    send(&mut port, b"b")?;
    let b = read_reply(&mut port, 3, Duration::from_millis(600));
    if b.len() < 3 || b[0] != b'Y' {
        return Err(MrtError::Comm(format!(
            "Board tidak mendukung mode blok (balasan: {:?}).",
            b
        )));
    }
    let block = ((b[1] as usize) << 8) | b[2] as usize;
    if block == 0 || block > 1024 {
        return Err(MrtError::Comm(format!("Ukuran blok tidak valid: {}", block)));
    }

    // e → hapus chip (bisa agak lama).
    thread::sleep(Duration::from_millis(100));
    expect_cr(&mut port, b"e", "erase", Duration::from_secs(8))?;
    check_cancel(&job)?;

    // A 0 0 → alamat awal.
    thread::sleep(Duration::from_millis(200));
    expect_cr(&mut port, &[b'A', 0, 0], "address", Duration::from_millis(800))?;

    // Kirim blok — sama dengan SendHexCode: `B hi lo F data`, tidur 100 ms,
    // byte pertama balasan harus '\r'. Pembagian image.chunks(block) identik
    // dengan hitungan asli (blok penuh = floor((len-1)/block), sisanya terakhir).
    // Balasan blok terakhir dibaca tetapi tidak dicek (persis aplikasi asli).
    let total = ((image.len() + block - 1) / block) as u32;
    emit_stage(app, "downloading", 0, total, "Downloading...");
    let mut packet: Vec<u8> = Vec::with_capacity(block + 4);
    for (idx, chunk) in image.chunks(block).enumerate() {
        check_cancel(&job)?;
        let is_last = idx as u32 + 1 == total;
        packet.clear();
        packet.push(b'B');
        packet.push((chunk.len() >> 8) as u8);
        packet.push((chunk.len() & 0xFF) as u8);
        packet.push(b'F');
        packet.extend_from_slice(chunk);
        send(&mut port, &packet)?;
        thread::sleep(Duration::from_millis(100));
        let reply = read_reply(&mut port, 1, Duration::from_secs(3));
        if !is_last && reply.first() != Some(&b'\r') {
            return Err(MrtError::Comm(format!(
                "Blok {}/{} tidak di-ACK board (balasan: {:?}).",
                idx + 1,
                total,
                reply
            )));
        }
        emit_stage(app, "downloading", idx as u32 + 1, total, "Downloading...");
    }

    let _ = port.clear(ClearBuffer::All);
    drop(port);
    emit_stage(app, "done", total, total, "Please reset board to run program");
    Ok(MrtOutcome::Flashed)
}

/// Upload `hex_path` ke board MRT di `port`.
/// Menunggu user menekan reset selama 100 × 100 ms (seperti MY ROBOT TIME).
pub async fn flash_hex(app: &AppHandle, port: &str, hex_path: &Path) -> Result<MrtOutcome, MrtError> {
    let text = fs::read_to_string(hex_path)
        .map_err(|e| MrtError::Hex(format!("{}: {}", hex_path.display(), e)))?;
    let image = parse_intel_hex(&text).map_err(MrtError::Hex)?;

    let app2 = app.clone();
    let port = port.to_string();
    let result = tokio::task::spawn_blocking(move || flash_blocking(&app2, &port, &image))
        .await
        .map_err(|e| MrtError::Comm(format!("Thread upload MRT gagal: {}", e)))?;

    if let Err(err) = &result {
        match err {
            MrtError::Cancelled => {}
            other => emit_stage(app, "error", 0, 0, &other.to_string()),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::parse_intel_hex;

    #[test]
    fn parse_simple_hex() {
        let hex = ":020000000C945E\n:0400040001020304EE\n:00000001FF\n";
        let img = parse_intel_hex(hex).unwrap();
        assert_eq!(img, vec![0x0C, 0x94, 0, 0, 1, 2, 3, 4]);
    }

    #[test]
    fn reject_bad_checksum() {
        assert!(parse_intel_hex(":020000000C945F\n:00000001FF\n").is_err());
    }
}
