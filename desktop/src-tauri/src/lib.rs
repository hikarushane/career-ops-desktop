mod runner;
mod sidecar;
mod workspace;

#[cfg(unix)]
fn raise_fd_limit() {
    use libc::{getrlimit, setrlimit, rlimit, RLIMIT_NOFILE};
    unsafe {
        let mut lim = rlimit { rlim_cur: 0, rlim_max: 0 };
        if getrlimit(RLIMIT_NOFILE, &mut lim) == 0 && lim.rlim_cur < lim.rlim_max {
            lim.rlim_cur = lim.rlim_max.min(10240);
            let _ = setrlimit(RLIMIT_NOFILE, &lim);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(unix)]
    raise_fd_limit();

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
            sidecar::install_provider,
            sidecar::doctor,
            sidecar::list_applications,
            sidecar::read_report,
            sidecar::set_status,
            sidecar::language_settings,
            sidecar::help_document,
            sidecar::resolve_job_language,
            runner::run_task,
            runner::cancel_task,
            runner::generation_result,
            runner::apply_generation,
            runner::discard_generation,
            workspace::default_workspace_path,
            workspace::inspect_workspace,
            workspace::initialize_workspace,
            workspace::prepare_onboarding_workspace,
            workspace::set_analysis_language,
            workspace::stage_intake_files_for_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
