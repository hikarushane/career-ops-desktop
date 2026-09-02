//! The only place that spawns the career-data sidecar.
//!
//! No parsing happens here. Domain logic lives in Go, presentation lives in
//! TypeScript, and this file forwards the sidecar's JSON text between them.

use tauri_plugin_shell::ShellExt;

fn data_service_spawn_error(error: impl std::fmt::Display) -> String {
    format!(
        "CareerOps data service failed to start: {error}. Reinstall or update CareerOps Desktop."
    )
}

/// Runs the sidecar and returns its stdout without interpreting the payload.
///
/// A `{"ok": false, ...}` payload remains a normal sidecar response. `Err`
/// is reserved for the sidecar failing to run or not producing stdout.
async fn run(app: &tauri::AppHandle, args: Vec<String>) -> Result<String, String> {
    let command = app
        .shell()
        .sidecar("career-data")
        .map_err(data_service_spawn_error)?
        .args(args);

    let output = command.output().await.map_err(data_service_spawn_error)?;

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("sidecar returned non-UTF-8 stdout: {error}"))?;
    if stdout.trim().is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("sidecar returned no stdout. stderr: {stderr}"));
    }
    Ok(stdout)
}

#[tauri::command]
pub async fn contracts(app: tauri::AppHandle) -> Result<String, String> {
    run(&app, vec!["contracts".into()]).await
}

#[tauri::command]
pub async fn providers(app: tauri::AppHandle) -> Result<String, String> {
    run(&app, vec!["providers".into()]).await
}

#[tauri::command]
pub async fn install_provider(app: tauri::AppHandle, id: String) -> Result<String, String> {
    run(&app, vec!["install-provider".into(), "--id".into(), id]).await
}

#[tauri::command]
pub async fn doctor(app: tauri::AppHandle, path: String) -> Result<String, String> {
    run(&app, vec!["doctor".into(), "--path".into(), path]).await
}

#[tauri::command]
pub async fn list_applications(app: tauri::AppHandle, path: String) -> Result<String, String> {
    run(&app, vec!["list".into(), "--path".into(), path]).await
}

#[tauri::command]
pub async fn read_report(
    app: tauri::AppHandle,
    path: String,
    file: String,
) -> Result<String, String> {
    run(
        &app,
        vec![
            "report".into(),
            "--path".into(),
            path,
            "--file".into(),
            file,
        ],
    )
    .await
}

#[tauri::command]
pub async fn set_status(
    app: tauri::AppHandle,
    path: String,
    report_number: String,
    expect_status: String,
    status: String,
) -> Result<String, String> {
    run(
        &app,
        vec![
            "set-status".into(),
            "--path".into(),
            path,
            "--report-number".into(),
            report_number,
            "--expect-status".into(),
            expect_status,
            "--status".into(),
            status,
        ],
    )
    .await
}

#[tauri::command]
pub async fn language_settings(app: tauri::AppHandle, path: String) -> Result<String, String> {
    run(
        &app,
        vec!["language-settings".into(), "--path".into(), path],
    )
    .await
}

#[tauri::command]
pub async fn help_document(
    app: tauri::AppHandle,
    path: String,
    language: String,
) -> Result<String, String> {
    run(
        &app,
        vec![
            "help-document".into(),
            "--path".into(),
            path,
            "--language".into(),
            language,
        ],
    )
    .await
}

#[tauri::command]
pub async fn resolve_job_language(
    app: tauri::AppHandle,
    path: String,
    text: String,
) -> Result<String, String> {
    run(
        &app,
        vec![
            "resolve-job-language".into(),
            "--path".into(),
            path,
            "--text".into(),
            text,
        ],
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::data_service_spawn_error;
    use std::process::Command;

    #[test]
    fn missing_sidecar_spawn_points_to_reinstall_or_update() {
        let error = Command::new("careerops-definitely-missing-sidecar")
            .output()
            .expect_err("fixture executable must not exist");
        let message = data_service_spawn_error(error);

        assert!(message.contains("Reinstall or update CareerOps Desktop"));
        assert!(!message.contains("npm"));
        assert!(!message.contains("build:sidecar"));
    }
}
