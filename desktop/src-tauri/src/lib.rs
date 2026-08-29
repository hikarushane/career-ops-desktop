mod runner;
mod sidecar;
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }
            Ok(())
        })
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
            runner::bind_intake_proposal,
            runner::discard_intake_session,
            runner::cancel_task,
            workspace::default_workspace_path,
            workspace::inspect_workspace,
            workspace::initialize_workspace,
            workspace::stage_intake_files_for_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
