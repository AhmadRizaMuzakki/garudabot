use std::fs;

#[tauri::command]
pub fn file_write(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, data).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn app_quit(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}
