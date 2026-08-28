use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{self, BufReader, Read};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageIntakeFile {
    pub source_path: String,
    pub category: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedIntakeFile {
    pub source_path: String,
    pub destination_path: String,
    pub category: String,
    pub duplicate: bool,
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

fn intake_category_folder(category: &str) -> Result<&'static str, String> {
    match category {
        "cv" => Ok("cv"),
        "work" => Ok("work"),
        "research" => Ok("research"),
        "diplomas" => Ok("diplomas"),
        "linkedin" => Ok("linkedin"),
        "references" => Ok("references"),
        "certificates" => Ok("certificates"),
        "portfolio" => Ok("portfolio"),
        _ => Err("intake category is not allowed".to_owned()),
    }
}

fn canonical_category_directory(workspace: &Path, category: &str) -> Result<PathBuf, String> {
    let workspace = fs::canonicalize(workspace)
        .map_err(|error| format!("cannot resolve workspace: {error}"))?;
    if !workspace.is_dir() {
        return Err(format!(
            "workspace is not a directory: {}",
            workspace.display()
        ));
    }

    let documents = workspace.join("documents");
    fs::create_dir_all(&documents)
        .map_err(|error| format!("cannot create intake documents directory: {error}"))?;
    if fs::canonicalize(&documents)
        .map_err(|error| format!("cannot resolve intake documents directory: {error}"))?
        != documents
    {
        return Err("intake documents directory must not resolve outside the workspace".to_owned());
    }

    let category_directory = documents.join(category);
    fs::create_dir_all(&category_directory)
        .map_err(|error| format!("cannot create intake category directory: {error}"))?;
    if fs::canonicalize(&category_directory)
        .map_err(|error| format!("cannot resolve intake category directory: {error}"))?
        != category_directory
    {
        return Err("intake category directory must not resolve outside the workspace".to_owned());
    }

    Ok(category_directory)
}

fn source_basename(source: &Path) -> Result<OsString, String> {
    let basename = source
        .file_name()
        .ok_or_else(|| "intake source must have a filename".to_owned())?;
    let mut components = Path::new(basename).components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return Err("intake source filename is not safe".to_owned());
    }

    Ok(basename.to_os_string())
}

fn files_equal(left: &Path, right: &Path) -> Result<bool, String> {
    let left_metadata =
        fs::metadata(left).map_err(|error| format!("cannot inspect intake source: {error}"))?;
    let right_metadata = fs::metadata(right)
        .map_err(|error| format!("cannot inspect staged intake file: {error}"))?;
    if left_metadata.len() != right_metadata.len() {
        return Ok(false);
    }

    let mut left = BufReader::new(
        fs::File::open(left).map_err(|error| format!("cannot read intake source: {error}"))?,
    );
    let mut right = BufReader::new(
        fs::File::open(right)
            .map_err(|error| format!("cannot read staged intake file: {error}"))?,
    );
    let mut left_buffer = [0; 8192];
    let mut right_buffer = [0; 8192];

    loop {
        let left_read = left
            .read(&mut left_buffer)
            .map_err(|error| format!("cannot read intake source: {error}"))?;
        let right_read = right
            .read(&mut right_buffer)
            .map_err(|error| format!("cannot read staged intake file: {error}"))?;
        if left_read != right_read || left_buffer[..left_read] != right_buffer[..right_read] {
            return Ok(false);
        }
        if left_read == 0 {
            return Ok(true);
        }
    }
}

fn suffixed_basename(basename: &std::ffi::OsStr, suffix: usize) -> OsString {
    let path = Path::new(basename);
    let mut candidate = path.file_stem().unwrap_or(basename).to_os_string();
    candidate.push(format!("-{suffix}"));
    if let Some(extension) = path.extension() {
        candidate.push(".");
        candidate.push(extension);
    }
    candidate
}

fn copy_file_exclusive(source: &Path, destination: &Path) -> io::Result<()> {
    let mut source_file = fs::File::open(source)?;
    let mut destination_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;

    if let Err(error) = io::copy(&mut source_file, &mut destination_file) {
        drop(destination_file);
        fs::remove_file(destination).ok();
        return Err(error);
    }

    Ok(())
}

pub fn stage_intake_files(
    workspace: &Path,
    files: &[StageIntakeFile],
) -> Result<Vec<StagedIntakeFile>, String> {
    let mut staged = Vec::with_capacity(files.len());

    for file in files {
        let category = intake_category_folder(&file.category)?;
        let source = Path::new(&file.source_path);
        if !fs::metadata(source)
            .map_err(|error| format!("cannot inspect intake source: {error}"))?
            .is_file()
        {
            return Err(format!("intake source is not a file: {}", source.display()));
        }

        let category_directory = canonical_category_directory(workspace, category)?;
        let basename = source_basename(source)?;
        let mut suffix = 1;

        loop {
            let candidate_name = if suffix == 1 {
                basename.clone()
            } else {
                suffixed_basename(&basename, suffix)
            };
            let destination = category_directory.join(candidate_name);
            if !destination.starts_with(&category_directory)
                || destination.parent() != Some(category_directory.as_path())
            {
                return Err("intake destination would escape its category directory".to_owned());
            }

            match fs::symlink_metadata(&destination) {
                Ok(metadata) if metadata.file_type().is_symlink() => {
                    return Err("staged intake destination must not be a symlink".to_owned());
                }
                Ok(metadata) if metadata.is_file() => {
                    if files_equal(source, &destination)? {
                        staged.push(StagedIntakeFile {
                            source_path: file.source_path.clone(),
                            destination_path: destination.to_string_lossy().into_owned(),
                            category: category.to_owned(),
                            duplicate: true,
                        });
                        break;
                    }
                    suffix += 1;
                }
                Ok(_) => suffix += 1,
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    match copy_file_exclusive(source, &destination) {
                        Ok(()) => {
                            staged.push(StagedIntakeFile {
                                source_path: file.source_path.clone(),
                                destination_path: destination.to_string_lossy().into_owned(),
                                category: category.to_owned(),
                                duplicate: false,
                            });
                            break;
                        }
                        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => suffix += 1,
                        Err(error) => return Err(format!("cannot stage intake file: {error}")),
                    }
                }
                Err(error) => {
                    return Err(format!("cannot inspect staged intake destination: {error}"))
                }
            }
        }
    }

    Ok(staged)
}

#[tauri::command]
pub fn stage_intake_files_for_workspace(
    root: String,
    files: Vec<StageIntakeFile>,
) -> Result<Vec<StagedIntakeFile>, String> {
    stage_intake_files(Path::new(&root), &files)
}

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

    fn stage_file(source: &Path, category: &str) -> StageIntakeFile {
        StageIntakeFile {
            source_path: source.to_string_lossy().into_owned(),
            category: category.to_owned(),
        }
    }

    #[test]
    fn stages_a_copy_without_changing_the_source() {
        let workspace = TempDir::new("stage-copy");
        let source_dir = TempDir::new("stage-source");
        let source = source_dir.path().join("resume.pdf");
        fs::write(&source, "original CV").unwrap();

        let staged = stage_intake_files(workspace.path(), &[stage_file(&source, "cv")]).unwrap();

        let destination = workspace.path().join("documents/cv/resume.pdf");
        assert_eq!(staged.len(), 1);
        assert!(!staged[0].duplicate);
        assert_eq!(
            PathBuf::from(&staged[0].destination_path),
            fs::canonicalize(&destination).unwrap()
        );
        assert_eq!(fs::read_to_string(&source).unwrap(), "original CV");
        assert_eq!(fs::read_to_string(destination).unwrap(), "original CV");
    }

    #[test]
    fn rejects_a_category_that_would_escape_documents() {
        let workspace = TempDir::new("stage-traversal");
        let source_dir = TempDir::new("stage-traversal-source");
        let source = source_dir.path().join("resume.pdf");
        fs::write(&source, "original CV").unwrap();

        let error =
            stage_intake_files(workspace.path(), &[stage_file(&source, "../config")]).unwrap_err();

        assert!(error.contains("category"));
        assert!(!workspace.path().join("config/resume.pdf").exists());
    }

    #[test]
    fn skips_an_existing_file_with_identical_content() {
        let workspace = TempDir::new("stage-duplicate");
        let first_source_dir = TempDir::new("stage-duplicate-first");
        let second_source_dir = TempDir::new("stage-duplicate-second");
        let first = first_source_dir.path().join("master.pdf");
        let second = second_source_dir.path().join("master.pdf");
        fs::write(&first, "same content").unwrap();
        fs::write(&second, "same content").unwrap();

        stage_intake_files(workspace.path(), &[stage_file(&first, "diplomas")]).unwrap();
        let staged =
            stage_intake_files(workspace.path(), &[stage_file(&second, "diplomas")]).unwrap();

        assert!(staged[0].duplicate);
        assert_eq!(
            PathBuf::from(&staged[0].destination_path),
            fs::canonicalize(workspace.path().join("documents/diplomas/master.pdf")).unwrap()
        );
        assert_eq!(fs::read_to_string(second).unwrap(), "same content");
    }

    #[test]
    fn suffixes_same_named_files_with_different_content_deterministically() {
        let workspace = TempDir::new("stage-collision");
        let first_source_dir = TempDir::new("stage-collision-first");
        let second_source_dir = TempDir::new("stage-collision-second");
        let third_source_dir = TempDir::new("stage-collision-third");
        let first = first_source_dir.path().join("master.pdf");
        let second = second_source_dir.path().join("master.pdf");
        let third = third_source_dir.path().join("master.pdf");
        fs::write(&first, "first").unwrap();
        fs::write(&second, "second").unwrap();
        fs::write(&third, "third").unwrap();

        stage_intake_files(workspace.path(), &[stage_file(&first, "diplomas")]).unwrap();
        let second_result =
            stage_intake_files(workspace.path(), &[stage_file(&second, "diplomas")]).unwrap();
        let third_result =
            stage_intake_files(workspace.path(), &[stage_file(&third, "diplomas")]).unwrap();

        assert_eq!(
            PathBuf::from(&second_result[0].destination_path),
            fs::canonicalize(workspace.path().join("documents/diplomas/master-2.pdf")).unwrap()
        );
        assert_eq!(
            PathBuf::from(&third_result[0].destination_path),
            fs::canonicalize(workspace.path().join("documents/diplomas/master-3.pdf")).unwrap()
        );
        assert_eq!(
            fs::read_to_string(workspace.path().join("documents/diplomas/master.pdf")).unwrap(),
            "first"
        );
    }
}
