use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceKind {
    Missing,
    Empty,
    Careerops,
    NonemptyInvalid,
}

#[derive(Serialize)]
pub struct WorkspaceInspection {
    path: String,
    kind: WorkspaceKind,
}

pub fn workspace_path_from_documents_dir(documents_dir: &Path) -> PathBuf {
    documents_dir.join("CareerOps")
}

#[tauri::command]
pub fn default_workspace_path(app: tauri::AppHandle) -> Result<String, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("cannot resolve Documents directory: {error}"))?;

    Ok(workspace_path_from_documents_dir(&documents)
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
pub fn inspect_workspace(path: String) -> Result<WorkspaceInspection, String> {
    let workspace = PathBuf::from(&path);
    let kind = if !workspace.exists() {
        WorkspaceKind::Missing
    } else if !workspace.is_dir() {
        WorkspaceKind::NonemptyInvalid
    } else {
        let mut entries = workspace
            .read_dir()
            .map_err(|error| format!("cannot inspect workspace: {error}"))?;

        if entries.next().is_none() {
            WorkspaceKind::Empty
        } else if workspace.join("doctor.mjs").is_file() {
            WorkspaceKind::Careerops
        } else {
            WorkspaceKind::NonemptyInvalid
        }
    };

    Ok(WorkspaceInspection { path, kind })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_careerops_to_macos_documents_dir() {
        let actual =
            workspace_path_from_documents_dir(Path::new("/Users/Alice/Documents"));

        assert_eq!(
            actual,
            PathBuf::from("/Users/Alice/Documents/CareerOps")
        );
    }

    #[test]
    fn appends_careerops_without_assuming_a_windows_userprofile_layout() {
        let actual =
            workspace_path_from_documents_dir(Path::new("D:/OneDrive/Documents"));

        assert_eq!(
            actual,
            PathBuf::from("D:/OneDrive/Documents/CareerOps")
        );
    }
}
