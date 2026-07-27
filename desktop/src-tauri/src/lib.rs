mod sidecar;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            sidecar::doctor,
            sidecar::list_applications,
            sidecar::read_report,
            sidecar::set_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
