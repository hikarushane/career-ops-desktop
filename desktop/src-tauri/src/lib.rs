mod runner;
mod sidecar;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(runner::RunnerState::new())
        .invoke_handler(tauri::generate_handler![
            sidecar::contracts,
            sidecar::providers,
            sidecar::doctor,
            sidecar::list_applications,
            sidecar::read_report,
            sidecar::set_status,
            sidecar::language_settings,
            sidecar::set_analysis_language,
            sidecar::help_document,
            sidecar::resolve_job_language,
            runner::run_task,
            runner::cancel_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
