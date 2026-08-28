use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceKind {
    Missing,
    Empty,
    Careerops,
    NonemptyInvalid,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInspection {
    pub path: String,
    pub kind: WorkspaceKind,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInitResult {
    pub path: String,
    pub created: bool,
}

const USER_DIRECTORIES: &[&str] = &[
    "documents/cv",
    "documents/work",
    "documents/research",
    "documents/diplomas",
    "documents/linkedin",
    "documents/references",
    "documents/certificates",
    "documents/portfolio",
    "data",
    "reports",
    "output",
    "jds",
];

const CAREEROPS_SYSTEM_INVARIANTS: &[&str] = &[
    "doctor.mjs",
    "modes/_shared.md",
    "modes/_profile.template.md",
    "config/profile.example.yml",
    "templates/portals.example.yml",
];

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
    let kind = inspect_workspace_path(&workspace)?;

    Ok(WorkspaceInspection { path, kind })
}

pub fn inspect_workspace_path(workspace: &Path) -> Result<WorkspaceKind, String> {
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
        } else if CAREEROPS_SYSTEM_INVARIANTS
            .iter()
            .all(|path| workspace.join(path).is_file())
        {
            WorkspaceKind::Careerops
        } else {
            WorkspaceKind::NonemptyInvalid
        }
    };

    Ok(kind)
}

fn copy_directory_contents(source: &Path, target: &Path) -> Result<(), String> {
    for entry in source
        .read_dir()
        .map_err(|error| format!("cannot read workspace seed: {error}"))?
    {
        let entry = entry.map_err(|error| format!("cannot read workspace seed entry: {error}"))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|error| format!("cannot inspect workspace seed entry: {error}"))?;

        if file_type.is_dir() {
            fs::create_dir_all(&target_path)
                .map_err(|error| format!("cannot create workspace directory: {error}"))?;
            copy_directory_contents(&source_path, &target_path)?;
        } else if file_type.is_file() {
            fs::copy(&source_path, &target_path)
                .map_err(|error| format!("cannot copy workspace seed file: {error}"))?;
        } else {
            return Err(format!(
                "workspace seed contains an unsupported entry: {}",
                source_path.display()
            ));
        }
    }

    Ok(())
}

pub fn initialize_workspace_from_seed(
    workspace: &Path,
    seed: &Path,
) -> Result<WorkspaceInitResult, String> {
    let path = workspace.to_string_lossy().into_owned();
    match inspect_workspace_path(workspace)? {
        WorkspaceKind::Careerops => {
            return Ok(WorkspaceInitResult {
                path,
                created: false,
            });
        }
        WorkspaceKind::NonemptyInvalid => {
            return Err(format!(
                "target is not a CareerOps workspace: {}",
                workspace.display()
            ));
        }
        WorkspaceKind::Missing | WorkspaceKind::Empty => {}
    }

    if !CAREEROPS_SYSTEM_INVARIANTS
        .iter()
        .all(|path| seed.join(path).is_file())
    {
        return Err(format!(
            "packaged workspace seed is invalid: {}",
            seed.display()
        ));
    }

    fs::create_dir_all(workspace).map_err(|error| format!("cannot create workspace: {error}"))?;
    copy_directory_contents(seed, workspace)?;
    for directory in USER_DIRECTORIES {
        fs::create_dir_all(workspace.join(directory))
            .map_err(|error| format!("cannot create workspace directory: {error}"))?;
    }

    Ok(WorkspaceInitResult {
        path,
        created: true,
    })
}

#[tauri::command]
pub fn initialize_workspace(
    app: tauri::AppHandle,
    path: String,
) -> Result<WorkspaceInitResult, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("cannot resolve application resource directory: {error}"))?;

    initialize_workspace_from_seed(Path::new(&path), &resource_dir.join("workspace-seed"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let id = NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "career-ops-workspace-{label}-{}-{id}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).ok();
        }
    }

    fn seed() -> TempDir {
        let seed = TempDir::new("seed");
        fs::write(seed.path().join("doctor.mjs"), "seed doctor\n").unwrap();
        fs::create_dir_all(seed.path().join("modes")).unwrap();
        fs::write(seed.path().join("modes/_shared.md"), "seed mode\n").unwrap();
        fs::write(
            seed.path().join("modes/_profile.template.md"),
            "profile template\n",
        )
        .unwrap();
        fs::create_dir_all(seed.path().join("config")).unwrap();
        fs::write(
            seed.path().join("config/profile.example.yml"),
            "profile: example\n",
        )
        .unwrap();
        fs::create_dir_all(seed.path().join("templates")).unwrap();
        fs::write(
            seed.path().join("templates/portals.example.yml"),
            "companies: []\n",
        )
        .unwrap();
        seed
    }

    fn mark_as_careerops(workspace: &Path, doctor: &str) {
        fs::write(workspace.join("doctor.mjs"), doctor).unwrap();
        fs::create_dir_all(workspace.join("modes")).unwrap();
        fs::write(workspace.join("modes/_shared.md"), "shared rules\n").unwrap();
        fs::write(
            workspace.join("modes/_profile.template.md"),
            "profile template\n",
        )
        .unwrap();
        fs::create_dir_all(workspace.join("config")).unwrap();
        fs::write(
            workspace.join("config/profile.example.yml"),
            "profile: example\n",
        )
        .unwrap();
        fs::create_dir_all(workspace.join("templates")).unwrap();
        fs::write(
            workspace.join("templates/portals.example.yml"),
            "companies: []\n",
        )
        .unwrap();
    }

    #[test]
    fn appends_careerops_to_macos_documents_dir() {
        let actual = workspace_path_from_documents_dir(Path::new("/Users/Alice/Documents"));

        assert_eq!(actual, PathBuf::from("/Users/Alice/Documents/CareerOps"));
    }

    #[test]
    fn appends_careerops_without_assuming_a_windows_userprofile_layout() {
        let actual = workspace_path_from_documents_dir(Path::new("D:/OneDrive/Documents"));

        assert_eq!(actual, PathBuf::from("D:/OneDrive/Documents/CareerOps"));
    }

    #[test]
    fn classifies_a_missing_path() {
        let parent = TempDir::new("missing-inspection");
        let workspace = parent.path().join("CareerOps");

        assert_eq!(
            inspect_workspace_path(&workspace).unwrap(),
            WorkspaceKind::Missing
        );
    }

    #[test]
    fn classifies_an_empty_directory() {
        let workspace = TempDir::new("empty-inspection");

        assert_eq!(
            inspect_workspace_path(workspace.path()).unwrap(),
            WorkspaceKind::Empty
        );
    }

    #[test]
    fn classifies_a_careerops_workspace_from_canonical_system_scaffolds() {
        let workspace = TempDir::new("valid-inspection");
        mark_as_careerops(workspace.path(), "export {};\n");

        assert_eq!(
            inspect_workspace_path(workspace.path()).unwrap(),
            WorkspaceKind::Careerops
        );
    }

    #[test]
    fn doctor_filename_alone_does_not_make_an_unrelated_directory_valid() {
        let workspace = TempDir::new("doctor-only-inspection");
        fs::write(workspace.path().join("doctor.mjs"), "not CareerOps\n").unwrap();

        assert_eq!(
            inspect_workspace_path(workspace.path()).unwrap(),
            WorkspaceKind::NonemptyInvalid
        );
    }

    #[test]
    fn classifies_a_nonempty_unrelated_directory_as_invalid() {
        let workspace = TempDir::new("invalid-inspection");
        fs::write(workspace.path().join("notes.txt"), "not CareerOps\n").unwrap();

        assert_eq!(
            inspect_workspace_path(workspace.path()).unwrap(),
            WorkspaceKind::NonemptyInvalid
        );
    }

    #[test]
    fn initializes_a_missing_target_from_the_seed() {
        let parent = TempDir::new("missing-init");
        let workspace = parent.path().join("CareerOps");
        let seed = seed();

        let result = initialize_workspace_from_seed(&workspace, seed.path()).unwrap();

        assert!(result.created);
        assert!(workspace.join("doctor.mjs").is_file());
        assert!(workspace.join("documents/cv").is_dir());
        assert!(workspace.join("documents/work").is_dir());
        assert!(workspace.join("documents/research").is_dir());
        assert!(workspace.join("documents/diplomas").is_dir());
        assert!(workspace.join("documents/linkedin").is_dir());
        assert!(workspace.join("documents/references").is_dir());
        assert!(workspace.join("documents/certificates").is_dir());
        assert!(workspace.join("documents/portfolio").is_dir());
        assert!(workspace.join("data").is_dir());
        assert!(workspace.join("reports").is_dir());
        assert!(workspace.join("output").is_dir());
        assert!(workspace.join("jds").is_dir());
    }

    #[test]
    fn initializes_an_empty_target_from_the_seed() {
        let workspace = TempDir::new("empty-init");
        let seed = seed();

        let result = initialize_workspace_from_seed(workspace.path(), seed.path()).unwrap();

        assert!(result.created);
        assert_eq!(
            fs::read_to_string(workspace.path().join("modes/_shared.md")).unwrap(),
            "seed mode\n"
        );
    }

    #[test]
    fn leaves_an_existing_careerops_workspace_untouched() {
        let workspace = TempDir::new("valid-init");
        let seed = seed();
        mark_as_careerops(workspace.path(), "user doctor\n");
        fs::write(workspace.path().join("cv.md"), "user cv\n").unwrap();

        let result = initialize_workspace_from_seed(workspace.path(), seed.path()).unwrap();

        assert!(!result.created);
        assert_eq!(
            fs::read_to_string(workspace.path().join("doctor.mjs")).unwrap(),
            "user doctor\n"
        );
        assert_eq!(
            fs::read_to_string(workspace.path().join("cv.md")).unwrap(),
            "user cv\n"
        );
    }

    #[test]
    fn refuses_to_initialize_a_nonempty_unrelated_directory() {
        let workspace = TempDir::new("invalid-init");
        let seed = seed();
        fs::write(workspace.path().join("notes.txt"), "keep me\n").unwrap();

        let error = initialize_workspace_from_seed(workspace.path(), seed.path()).unwrap_err();

        assert!(error.contains("not a CareerOps workspace"));
        assert_eq!(
            fs::read_to_string(workspace.path().join("notes.txt")).unwrap(),
            "keep me\n"
        );
        assert!(!workspace.path().join("doctor.mjs").exists());
    }
}
