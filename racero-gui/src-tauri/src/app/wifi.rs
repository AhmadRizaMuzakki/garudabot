use std::fs;
use std::time::Instant;

/// Hotspot firmware bridge ESP-01, dipakai board non-ESP32 (Arduino + ESP-01).
/// Nilainya harus sama dengan AP_SSID/AP_PASS/BRIDGE_PORT di
/// firmware/Esp01ArduinoBridge.ino.
pub(crate) const BRIDGE_AP_SSID_PREFIX: &str = "Garudabot";
pub(crate) const BRIDGE_AP_PASSWORD: &str = "12345678";
pub(crate) const BRIDGE_PORT: &str = "8266";

/// Gateway softAP bawaan ESP8266 (Arduino + ESP-01 bridge).
pub(crate) const AP_GATEWAY_IP: &str = "192.168.4.1";

/// netsh dipanggil langsung (bukan lewat sidecar) karena ia bagian dari Windows.
/// CREATE_NO_WINDOW mencegah jendela konsol berkedip di depan pengguna.
#[cfg(windows)]
pub(crate) fn run_netsh(args: &[&str]) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let output = std::process::Command::new("netsh")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("WIFI: gagal menjalankan netsh: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(not(windows))]
pub(crate) fn run_netsh(_args: &[&str]) -> Result<String, String> {
    Err("WIFI: pairing otomatis baru tersedia di Windows.".to_string())
}

/// Ambil nilai setelah ':' dari baris berlabel SSID, mengabaikan baris BSSID.
/// Label "SSID"/"BSSID" tidak diterjemahkan oleh netsh, jadi aman dipakai
/// sebagai penanda meski bahasa Windows bukan Inggris.
pub(crate) fn netsh_ssid_value(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if !trimmed.starts_with("SSID") {
        return None;
    }

    let value = trimmed.split_once(':')?.1.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

pub(crate) fn parse_netsh_networks(output: &str) -> Vec<(String, Option<u8>)> {
    let mut networks: Vec<(String, Option<u8>)> = Vec::new();

    for line in output.lines() {
        if let Some(ssid) = netsh_ssid_value(line) {
            if !networks.iter().any(|(name, _)| *name == ssid) {
                networks.push((ssid, None));
            }
            continue;
        }

        // Baris kekuatan sinyal satu-satunya yang memuat '%', labelnya bisa
        // terlokalisasi ("Signal"/"Sinyal") jadi yang dipakai adalah '%'.
        if let Some(percent_pos) = line.find('%') {
            let digits: String = line[..percent_pos]
                .chars()
                .rev()
                .take_while(|c| c.is_ascii_digit())
                .collect();

            if digits.is_empty() {
                continue;
            }

            let signal = digits.chars().rev().collect::<String>().parse::<u8>().ok();
            if let Some(last) = networks.last_mut() {
                if last.1.is_none() {
                    last.1 = signal;
                }
            }
        }
    }

    networks
}

pub(crate) fn current_wifi_ssid() -> Option<String> {
    let output = run_netsh(&["wlan", "show", "interfaces"]).ok()?;
    output.lines().find_map(netsh_ssid_value)
}

pub(crate) fn xml_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub(crate) fn wlan_profile_xml(ssid: &str, password: &str) -> String {
    format!(
        r#"<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>{ssid}</name>
    <SSIDConfig>
        <SSID>
            <name>{ssid}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>manual</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>{password}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>
"#,
        ssid = xml_escape(ssid),
        password = xml_escape(password)
    )
}

/// Profil hotspot per jenis papan. ESP32 dipairing untuk OTA (butuh password
/// OTA), sedangkan ESP-01 bridge dipairing untuk upload serial lewat TCP
/// (butuh nomor port).
pub(crate) struct ApProfile {
    prefix: &'static str,
    password: &'static str,
    port: Option<&'static str>,
    ota_password: Option<&'static str>,
}

pub(crate) fn ap_profile(kind: &str) -> ApProfile {
    if kind == "bridge" {
        ApProfile {
            prefix: BRIDGE_AP_SSID_PREFIX,
            password: BRIDGE_AP_PASSWORD,
            port: Some(BRIDGE_PORT),
            ota_password: None,
        }
    } else {
        // ESP32 SoftAP/OTA diganti BLE native; scan WiFi ESP32 tidak dipakai.
        ApProfile {
            prefix: "___esp32-softap-disabled",
            password: BRIDGE_AP_PASSWORD,
            port: None,
            ota_password: None,
        }
    }
}

pub(crate) fn is_board_ssid(ssid: &str, prefix: &str) -> bool {
    ssid.to_uppercase().starts_with(&prefix.to_uppercase())
}

#[tauri::command]
pub async fn wifi_scan_boards(kind: Option<String>) -> Result<String, String> {
    let kind = kind.unwrap_or_default();

    tauri::async_runtime::spawn_blocking(move || {
        let profile = ap_profile(&kind);
        let output = run_netsh(&["wlan", "show", "networks", "mode=bssid"])?;
        let current = current_wifi_ssid();

        let boards: Vec<serde_json::Value> = parse_netsh_networks(&output)
            .into_iter()
            .filter(|(ssid, _)| is_board_ssid(ssid, profile.prefix))
            .map(|(ssid, signal)| {
                let connected = current.as_deref() == Some(ssid.as_str());
                serde_json::json!({
                    "ssid": ssid,
                    "signal": signal,
                    "connected": connected
                })
            })
            .collect();

        Ok(serde_json::json!({
            "boards": boards,
            "current_ssid": current,
            "ip": AP_GATEWAY_IP,
            "port": profile.port,
            "ota_password": profile.ota_password
        })
        .to_string())
    })
    .await
    .map_err(|e| format!("WIFI: scan gagal dijalankan: {}", e))?
}

#[tauri::command]
pub async fn wifi_connect_board(ssid: String, kind: Option<String>) -> Result<String, String> {
    let ssid = ssid.trim().to_string();
    if ssid.is_empty() {
        return Err("WIFI: nama hotspot kosong.".to_string());
    }

    let kind = kind.unwrap_or_default();
    let profile = ap_profile(&kind);

    // Pairing hanya untuk hotspot board, supaya tombol ini tidak bisa dipakai
    // memindahkan koneksi WiFi pengguna ke jaringan sembarangan.
    if !is_board_ssid(&ssid, profile.prefix) {
        return Err(format!(
            "WIFI: '{}' bukan hotspot board (harus diawali {}).",
            ssid, profile.prefix
        ));
    }

    tauri::async_runtime::spawn_blocking(move || {
        if current_wifi_ssid().as_deref() == Some(ssid.as_str()) {
            return Ok(serde_json::json!({
                "ssid": ssid,
                "ip": AP_GATEWAY_IP,
                "port": profile.port,
                "ota_password": profile.ota_password,
                "already_connected": true
            })
            .to_string());
        }

        let profile_path = std::env::temp_dir().join("garudabot-wlan-profile.xml");
        fs::write(&profile_path, wlan_profile_xml(&ssid, profile.password))
            .map_err(|e| format!("WIFI: gagal menulis profil WLAN: {}", e))?;

        let add_result = run_netsh(&[
            "wlan",
            "add",
            "profile",
            &format!("filename={}", profile_path.to_string_lossy()),
            "user=current",
        ])?;
        let _ = fs::remove_file(&profile_path);

        run_netsh(&["wlan", "connect", &format!("name={}", ssid), &format!("ssid={}", ssid)])
            .map_err(|e| format!("{} (profil: {})", e, add_result.trim()))?;

        // netsh connect hanya memicu; penyambungan selesai beberapa detik kemudian.
        let deadline = Instant::now();
        while deadline.elapsed().as_secs() < 20 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if current_wifi_ssid().as_deref() == Some(ssid.as_str()) {
                return Ok(serde_json::json!({
                    "ssid": ssid,
                    "ip": AP_GATEWAY_IP,
                    "port": profile.port,
                    "ota_password": profile.ota_password,
                    "already_connected": false
                })
                .to_string());
            }
        }

        Err(format!(
            "WIFI: gagal menyambung ke {} dalam 20 detik. Pastikan board menyala dan sudah pernah di-upload lewat USB.",
            ssid
        ))
    })
    .await
    .map_err(|e| format!("WIFI: pairing gagal dijalankan: {}", e))?
}

