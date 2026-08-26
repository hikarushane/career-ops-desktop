//! The only place that spawns the career-data sidecar.
//!
//! No parsing happens here. Domain logic lives in Go, presentation lives in
//! TypeScript, and this file moves bytes between them.

use serde_json::Value;
use tauri_plugin_shell::ShellExt;

/// Runs the sidecar and returns its stdout parsed as JSON.
///
/// A `{"ok": false, ...}` payload is a successful call: the sidecar ran and
/// reported a domain error, which the frontend renders. `Err` is reserved for
/// the sidecar failing to run or not producing JSON at all.
async fn run(app: &tauri::AppHandle, args: Vec<String>) -> Result<Value, String> {
    let command = app
        .shell()
        .sidecar("career-data")
        .map_err(|e| format!("sidecar not available: {e}. Run `npm run build:sidecar`."))?
        .args(args);

    let output = command
        .output()
        .await
        .map_err(|e| format!("sidecar failed to start: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    serde_json::from_str::<Value>(stdout.trim()).map_err(|e| {
        format!("sidecar did not return JSON ({e}).\nstdout: {stdout}\nstderr: {stderr}")
    })
}

#[tauri::command]
pub async fn contracts(app: tauri::AppHandle) -> Result<Value, String> {
    run(&app, vec!["contracts".into()]).await
}

#[tauri::command]
pub async fn providers(app: tauri::AppHandle) -> Result<Value, String> {
    run(&app, vec!["providers".into()]).await
}

#[tauri::command]
pub async fn doctor(app: tauri::AppHandle, path: String) -> Result<Value, String> {
    run(&app, vec!["doctor".into(), "--path".into(), path]).await
}

#[tauri::command]
pub async fn list_applications(app: tauri::AppHandle, path: String) -> Result<Value, String> {
    run(&app, vec!["list".into(), "--path".into(), path]).await
}

#[tauri::command]
pub async fn read_report(
    app: tauri::AppHandle,
    path: String,
    file: String,
) -> Result<Value, String> {
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
) -> Result<Value, String> {
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
