use std::collections::HashSet;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::ambient_authority;
use cap_std::fs::{Dir, File as CapFile, OpenOptions as CapOpenOptions};
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
    "documents/others",
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
        "others" => Ok("others"),
        _ => Err("intake category is not allowed".to_owned()),
    }
}

fn open_or_create_directory(parent: &Dir, name: &str) -> Result<Dir, String> {
    match parent.open_dir_nofollow(name) {
        Ok(directory) => Ok(directory),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            match parent.create_dir(name) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(format!("cannot create intake directory: {error}")),
            }
            parent.open_dir_nofollow(name).map_err(|error| {
                format!("cannot open intake directory without following links: {error}")
            })
        }
        Err(error) => Err(format!(
            "cannot open intake directory without following links: {error}"
        )),
    }
}

fn open_category_directory_in_workspace(workspace: &Dir, category: &str) -> Result<Dir, String> {
    let documents = open_or_create_directory(workspace, "documents")?;
    open_or_create_directory(&documents, category)
}

struct HeldWorkspace {
    parent: Dir,
    name: OsString,
    root: Dir,
}

impl HeldWorkspace {
    fn open(path: &Path) -> Result<Self, String> {
        let name = path
            .file_name()
            .ok_or_else(|| "workspace path must name a directory".to_owned())?
            .to_os_string();
        let parent_path = path
            .parent()
            .ok_or_else(|| "workspace path must have a parent directory".to_owned())?;
        let canonical_parent = fs::canonicalize(parent_path)
            .map_err(|error| format!("cannot resolve workspace parent directory: {error}"))?;
        let parent = Dir::open_ambient_dir(&canonical_parent, ambient_authority())
            .map_err(|error| format!("cannot open workspace parent directory: {error}"))?;
        let root = parent.open_dir_nofollow(&name).map_err(|error| {
            format!("cannot open workspace without following symbolic links: {error}")
        })?;
        Ok(Self { parent, name, root })
    }

    fn validate_entry(&self) -> Result<(), String> {
        let current = self
            .parent
            .open_dir_nofollow(&self.name)
            .map_err(|error| format!("CareerOps workspace changed while it was in use: {error}"))?;
        if !same_cap_directory(&self.root, &current)? {
            return Err("CareerOps workspace changed while it was in use".to_owned());
        }
        Ok(())
    }
}

fn regular_file_at(directory: &Dir, filename: &str) -> bool {
    directory
        .symlink_metadata(filename)
        .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
}

fn held_workspace_is_careerops(workspace: &Dir) -> bool {
    let Ok(modes) = workspace.open_dir_nofollow("modes") else {
        return false;
    };
    let Ok(config) = workspace.open_dir_nofollow("config") else {
        return false;
    };
    let Ok(templates) = workspace.open_dir_nofollow("templates") else {
        return false;
    };
    regular_file_at(workspace, "doctor.mjs")
        && regular_file_at(&modes, "_shared.md")
        && regular_file_at(&modes, "_profile.template.md")
        && regular_file_at(&config, "profile.example.yml")
        && regular_file_at(&templates, "portals.example.yml")
}

#[cfg(unix)]
fn same_cap_directory(left: &Dir, right: &Dir) -> Result<bool, String> {
    use cap_std::fs::MetadataExt;
    let left = left
        .dir_metadata()
        .map_err(|error| format!("cannot inspect held workspace directory: {error}"))?;
    let right = right
        .dir_metadata()
        .map_err(|error| format!("cannot inspect current workspace directory: {error}"))?;
    Ok(left.dev() == right.dev() && left.ino() == right.ino())
}

#[cfg(windows)]
fn same_cap_directory(left: &Dir, right: &Dir) -> Result<bool, String> {
    use cap_fs_ext::MetadataExt;
    let left = left
        .dir_metadata()
        .map_err(|error| format!("cannot inspect held workspace directory: {error}"))?;
    let right = right
        .dir_metadata()
        .map_err(|error| format!("cannot inspect current workspace directory: {error}"))?;
    Ok(left.dev() == right.dev() && left.ino() == right.ino())
}

#[cfg(not(any(unix, windows)))]
fn same_cap_directory(_left: &Dir, _right: &Dir) -> Result<bool, String> {
    Err("workspace identity checks are unavailable on this platform".to_owned())
}

#[cfg(test)]
fn open_category_directory(workspace: &Path, category: &str) -> Result<Dir, String> {
    let workspace = Dir::open_ambient_dir(workspace, ambient_authority())
        .map_err(|error| format!("cannot open workspace directory: {error}"))?;
    open_category_directory_in_workspace(&workspace, category)
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

fn files_equal(source: &Path, destination: &mut CapFile) -> Result<bool, String> {
    let mut source =
        fs::File::open(source).map_err(|error| format!("cannot read intake source: {error}"))?;
    let mut left_buffer = [0; 8192];
    let mut right_buffer = [0; 8192];

    loop {
        let left_read = source
            .read(&mut left_buffer)
            .map_err(|error| format!("cannot read intake source: {error}"))?;
        let right_read = destination
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

fn open_file_nofollow(directory: &Dir, filename: &std::ffi::OsStr) -> io::Result<CapFile> {
    let mut options = CapOpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    directory.open_with(filename, &options)
}

fn copy_file_exclusive(
    source: &Path,
    directory: &Dir,
    filename: &std::ffi::OsStr,
) -> io::Result<()> {
    let mut source_file = fs::File::open(source)?;
    let mut options = CapOpenOptions::new();
    options
        .write(true)
        .create_new(true)
        .follow(FollowSymlinks::No);
    let mut destination_file = directory.open_with(filename, &options)?;

    if let Err(error) = io::copy(&mut source_file, &mut destination_file) {
        drop(destination_file);
        directory.remove_file(filename).ok();
        return Err(error);
    }

    Ok(())
}

fn stage_file_in_category(
    source_path: &str,
    source: &Path,
    category: &str,
    directory: &Dir,
    destination_directory: &Path,
) -> Result<StagedIntakeFile, String> {
    let basename = source_basename(source)?;
    let mut suffix = 1;

    loop {
        let candidate_name = if suffix == 1 {
            basename.clone()
        } else {
            suffixed_basename(&basename, suffix)
        };
        match directory.symlink_metadata(&candidate_name) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("staged intake destination must not be a symlink".to_owned());
            }
            Ok(metadata) if metadata.is_file() => {
                let mut destination = open_file_nofollow(directory, &candidate_name)
                    .map_err(|error| format!("cannot read staged intake file: {error}"))?;
                if files_equal(source, &mut destination)? {
                    return Ok(StagedIntakeFile {
                        source_path: source_path.to_owned(),
                        destination_path: destination_directory
                            .join(&candidate_name)
                            .to_string_lossy()
                            .into_owned(),
                        category: category.to_owned(),
                        duplicate: true,
                    });
                }
                suffix += 1;
            }
            Ok(_) => suffix += 1,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                match copy_file_exclusive(source, directory, &candidate_name) {
                    Ok(()) => {
                        return Ok(StagedIntakeFile {
                            source_path: source_path.to_owned(),
                            destination_path: destination_directory
                                .join(&candidate_name)
                                .to_string_lossy()
                                .into_owned(),
                            category: category.to_owned(),
                            duplicate: false,
                        });
                    }
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => suffix += 1,
                    Err(error) => return Err(format!("cannot stage intake file: {error}")),
                }
            }
            Err(error) => return Err(format!("cannot inspect staged intake destination: {error}")),
        }
    }
}

fn stage_intake_files_with_hook<F>(
    workspace: &Path,
    files: &[StageIntakeFile],
    before_copy: F,
) -> Result<Vec<StagedIntakeFile>, String>
where
    F: FnOnce(),
{
    let held = HeldWorkspace::open(workspace)?;
    if !held_workspace_is_careerops(&held.root) {
        return Err("target is not a valid CareerOps workspace".to_owned());
    }
    before_copy();
    held.validate_entry()?;
    let mut staged = Vec::with_capacity(files.len());

    for file in files {
        held.validate_entry()?;
        let category = intake_category_folder(&file.category)?;
        let source = Path::new(&file.source_path);
        if !fs::metadata(source)
            .map_err(|error| format!("cannot inspect intake source: {error}"))?
            .is_file()
        {
            return Err(format!("intake source is not a file: {}", source.display()));
        }

        let category_directory = open_category_directory_in_workspace(&held.root, category)?;
        let destination_directory = workspace.join("documents").join(category);
        staged.push(stage_file_in_category(
            &file.source_path,
            source,
            category,
            &category_directory,
            &destination_directory,
        )?);
    }

    held.validate_entry()?;
    Ok(staged)
}

pub fn stage_intake_files(
    workspace: &Path,
    files: &[StageIntakeFile],
) -> Result<Vec<StagedIntakeFile>, String> {
    stage_intake_files_with_hook(workspace, files, || {})
}

#[tauri::command]
pub fn stage_intake_files_for_workspace(
    root: String,
    files: Vec<StageIntakeFile>,
) -> Result<Vec<StagedIntakeFile>, String> {
    stage_intake_files(Path::new(&root), &files)
}

fn collect_candidates(path: &Path, out: &mut Vec<String>) {
    let Ok(metadata) = fs::symlink_metadata(path) else { return };
    if metadata.file_type().is_symlink() {
        return;
    }
    if metadata.is_file() {
        out.push(path.to_string_lossy().into_owned());
        return;
    }
    if !metadata.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(path) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        collect_candidates(&entry.path(), out);
    }
}

pub fn list_intake_candidates_at(paths: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for path in paths {
        collect_candidates(Path::new(path), &mut out);
    }
    out.sort();
    out.dedup();
    out
}

#[tauri::command]
pub fn list_intake_candidates(paths: Vec<String>) -> Vec<String> {
    list_intake_candidates_at(&paths)
}

/// Caps a slug at this many characters so a very long pasted title or URL
/// doesn't produce an unwieldy (or filesystem-hostile) filename.
const MAX_SLUG_CHARS: usize = 80;

fn slugify_capture(name: &str) -> String {
    let mut out = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if ch == '_' {
            out.push('_');
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_matches('-').trim_matches('_').to_string();
    // `.chars().take(n)` truncates at a char boundary; every char pushed
    // above is ASCII, but this stays correct even if that ever changes.
    let truncated: String = out.chars().take(MAX_SLUG_CHARS).collect();
    truncated.trim_matches('-').trim_matches('_').to_string()
}

pub fn save_job_capture_at(root: &Path, slug: &str, text: &str) -> Result<String, String> {
    let dir = root.join("jds");
    if let Ok(metadata) = fs::symlink_metadata(&dir) {
        if metadata.file_type().is_symlink() {
            return Err("jds must not be a symlink".to_owned());
        }
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let base = slugify_capture(slug);
    let base = if base.is_empty() { "posting".to_owned() } else { base };
    let mut rel = format!("jds/{base}.md");
    let mut n = 2;
    loop {
        let path = root.join(&rel);
        if fs::symlink_metadata(&path).is_ok() {
            rel = format!("jds/{base}-{n}.md");
            n += 1;
            continue;
        }
        match fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
                return Ok(rel);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                rel = format!("jds/{base}-{n}.md");
                n += 1;
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

#[tauri::command]
pub fn save_job_capture(root: String, slug: String, text: String) -> Result<String, String> {
    save_job_capture_at(Path::new(&root), &slug, &text)
}

const CAREEROPS_SYSTEM_INVARIANTS: &[&str] = &[
    "doctor.mjs",
    "modes/_shared.md",
    "modes/_profile.template.md",
    "config/profile.example.yml",
    "templates/portals.example.yml",
];

const EMPTY_CV_SCAFFOLD: &str = concat!(
    "# Curriculum Vitae\n\n",
    "## Summary\n\n",
    "## Experience\n\n",
    "## Education\n\n",
    "## Skills\n",
);
const NEUTRAL_PROFILE_SCAFFOLD: &str = concat!(
    "# CareerOps profile\n",
    "# Add only your confirmed details; empty fields are intentional.\n",
    "candidate:\n",
    "  full_name: \"\"\n",
    "  email: \"\"\n",
    "target_roles:\n",
    "  primary: []\n",
    "  archetypes: []\n",
    "narrative:\n",
    "  superpowers: []\n",
    "  proof_points: []\n",
    "compensation: {}\n",
    "location: {}\n",
    "language:\n",
    "  analysis: en\n",
    "spend_tier: standard\n",
);
const NEUTRAL_PROFILE_MODE_SCAFFOLD: &str =
    "# User Profile Context\n\nAdd only your confirmed targeting, narrative, and proof points here.\n";
const NEUTRAL_PORTALS_SCAFFOLD: &str = concat!(
    "# CareerOps portal configuration\n",
    "# Add target roles and companies before scanning.\n",
    "title_filter:\n",
    "  positive: []\n",
    "tracked_companies: []\n",
);
const APPLICATIONS_TRACKER_SCAFFOLD: &str = concat!(
    "# Applications Tracker\n\n",
    "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n",
    "|---|------|---------|------|-------|--------|-----|--------|-------|\n",
);

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

#[derive(Clone)]
enum BootstrapEvent {
    BeforeEntry(PathBuf),
    BeforeMissingRootInstall(OsString),
    AfterMissingRootInstall,
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct EntryIdentity(u64, u64);

#[cfg(unix)]
fn entry_identity(metadata: &cap_std::fs::Metadata) -> Option<EntryIdentity> {
    use cap_std::fs::MetadataExt;
    Some(EntryIdentity(metadata.dev(), metadata.ino()))
}

#[cfg(windows)]
fn entry_identity(metadata: &cap_std::fs::Metadata) -> Option<EntryIdentity> {
    use cap_fs_ext::MetadataExt;
    Some(EntryIdentity(metadata.dev(), metadata.ino()))
}

#[cfg(not(any(unix, windows)))]
fn entry_identity(_metadata: &cap_std::fs::Metadata) -> Option<EntryIdentity> {
    None
}

enum CreatedEntryKind {
    File,
    Directory,
}

struct CreatedEntry {
    parent: Dir,
    name: OsString,
    kind: CreatedEntryKind,
    identity: Option<EntryIdentity>,
}

fn created_entry(
    parent: &Dir,
    name: &OsStr,
    kind: CreatedEntryKind,
    metadata: &cap_std::fs::Metadata,
) -> Result<CreatedEntry, String> {
    Ok(CreatedEntry {
        parent: parent
            .try_clone()
            .map_err(|error| format!("cannot retain workspace directory capability: {error}"))?,
        name: name.to_os_string(),
        kind,
        identity: entry_identity(metadata),
    })
}

fn rollback_created_entries(entries: &[CreatedEntry]) -> Vec<String> {
    let mut failures = Vec::new();
    for entry in entries.iter().rev() {
        let current = match entry.parent.symlink_metadata(&entry.name) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => {
                failures.push(format!("cannot inspect rollback entry: {error}"));
                continue;
            }
        };
        if entry.identity.is_none() || entry_identity(&current) != entry.identity {
            failures.push(format!(
                "workspace entry {} was replaced during rollback and was preserved",
                Path::new(&entry.name).display()
            ));
            continue;
        }
        let result = match entry.kind {
            CreatedEntryKind::File => entry.parent.remove_file(&entry.name),
            CreatedEntryKind::Directory => entry.parent.remove_dir(&entry.name),
        };
        if let Err(error) = result {
            failures.push(format!(
                "cannot roll back workspace entry {}: {error}",
                Path::new(&entry.name).display()
            ));
        }
    }
    failures
}

fn copy_seed_contents<F>(
    source: &Path,
    target: &Dir,
    relative_parent: &Path,
    created: &mut Vec<CreatedEntry>,
    owned_directories: &mut HashSet<PathBuf>,
    before_entry: &mut F,
) -> Result<(), String>
where
    F: FnMut(BootstrapEvent) -> Result<(), String>,
{
    let mut entries = source
        .read_dir()
        .map_err(|error| format!("cannot read workspace seed: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("cannot read workspace seed entry: {error}"))?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let name = entry.file_name();
        let relative = relative_parent.join(&name);
        before_entry(BootstrapEvent::BeforeEntry(relative.clone()))?;
        let source_path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("cannot inspect workspace seed entry: {error}"))?;
        if file_type.is_dir() {
            target.create_dir(&name).map_err(|error| {
                format!(
                    "cannot exclusively create workspace directory {}: {error}",
                    relative.display()
                )
            })?;
            let directory = target.open_dir_nofollow(&name).map_err(|error| {
                format!(
                    "cannot open created workspace directory {}: {error}",
                    relative.display()
                )
            })?;
            created.push(created_entry(
                target,
                &name,
                CreatedEntryKind::Directory,
                &directory.dir_metadata().map_err(|error| {
                    format!("cannot inspect created workspace directory: {error}")
                })?,
            )?);
            owned_directories.insert(relative.clone());
            copy_seed_contents(
                &source_path,
                &directory,
                &relative,
                created,
                owned_directories,
                before_entry,
            )?;
        } else if file_type.is_file() {
            let mut source_file = fs::File::open(&source_path)
                .map_err(|error| format!("cannot read workspace seed file: {error}"))?;
            let mut options = CapOpenOptions::new();
            options
                .write(true)
                .create_new(true)
                .follow(FollowSymlinks::No);
            let mut destination = target.open_with(&name, &options).map_err(|error| {
                format!(
                    "cannot exclusively create workspace file {}: {error}",
                    relative.display()
                )
            })?;
            created.push(created_entry(
                target,
                &name,
                CreatedEntryKind::File,
                &destination
                    .metadata()
                    .map_err(|error| format!("cannot inspect created workspace file: {error}"))?,
            )?);
            io::copy(&mut source_file, &mut destination)
                .and_then(|_| destination.sync_all())
                .map_err(|error| {
                    format!(
                        "cannot copy workspace seed file {}: {error}",
                        relative.display()
                    )
                })?;
        } else {
            return Err(format!(
                "workspace seed contains an unsupported entry: {}",
                source_path.display()
            ));
        }
    }
    Ok(())
}

fn ensure_user_directory<F>(
    root: &Dir,
    relative: &Path,
    created: &mut Vec<CreatedEntry>,
    owned_directories: &mut HashSet<PathBuf>,
    before_entry: &mut F,
) -> Result<(), String>
where
    F: FnMut(BootstrapEvent) -> Result<(), String>,
{
    let mut directory = root
        .try_clone()
        .map_err(|error| format!("cannot retain workspace directory capability: {error}"))?;
    let mut current = PathBuf::new();
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err("workspace user directory is not relative".to_owned());
        };
        current.push(name);
        match directory.symlink_metadata(name) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return Err(format!(
                        "workspace directory {} was replaced",
                        current.display()
                    ));
                }
                if !owned_directories.contains(&current) {
                    return Err(format!(
                        "workspace directory {} appeared during initialization",
                        current.display()
                    ));
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                before_entry(BootstrapEvent::BeforeEntry(current.clone()))?;
                directory.create_dir(name).map_err(|error| {
                    format!(
                        "cannot exclusively create workspace directory {}: {error}",
                        current.display()
                    )
                })?;
                let child = directory.open_dir_nofollow(name).map_err(|error| {
                    format!(
                        "cannot open created workspace directory {}: {error}",
                        current.display()
                    )
                })?;
                created.push(created_entry(
                    &directory,
                    name,
                    CreatedEntryKind::Directory,
                    &child.dir_metadata().map_err(|error| {
                        format!("cannot inspect created workspace directory: {error}")
                    })?,
                )?);
                owned_directories.insert(current.clone());
            }
            Err(error) => {
                return Err(format!(
                    "cannot inspect workspace directory {}: {error}",
                    current.display()
                ));
            }
        }
        directory = directory.open_dir_nofollow(name).map_err(|error| {
            format!(
                "cannot open workspace directory {} without following links: {error}",
                current.display()
            )
        })?;
    }
    Ok(())
}

fn populate_empty_root<F>(
    root: &Dir,
    seed: &Path,
    before_entry: &mut F,
) -> Result<Vec<CreatedEntry>, String>
where
    F: FnMut(BootstrapEvent) -> Result<(), String>,
{
    let mut created = Vec::new();
    let mut owned_directories = HashSet::new();
    let result = copy_seed_contents(
        seed,
        root,
        Path::new(""),
        &mut created,
        &mut owned_directories,
        before_entry,
    )
    .and_then(|()| {
        for directory in USER_DIRECTORIES {
            ensure_user_directory(
                root,
                Path::new(directory),
                &mut created,
                &mut owned_directories,
                before_entry,
            )?;
        }
        Ok(())
    });
    if let Err(error) = result {
        let rollback = rollback_created_entries(&created);
        return Err(if rollback.is_empty() {
            error
        } else {
            format!("{error}; rollback incomplete: {}", rollback.join("; "))
        });
    }
    Ok(created)
}

struct WorkspaceLocation {
    parent: Dir,
    parent_path: PathBuf,
    name: OsString,
}

impl WorkspaceLocation {
    fn open(path: &Path) -> Result<Self, String> {
        let name = path
            .file_name()
            .ok_or_else(|| "workspace path must name a directory".to_owned())?
            .to_os_string();
        let parent_path = path
            .parent()
            .ok_or_else(|| "workspace path must have a parent directory".to_owned())?;
        let canonical_parent = fs::canonicalize(parent_path)
            .map_err(|error| format!("cannot resolve workspace parent directory: {error}"))?;
        let parent = Dir::open_ambient_dir(&canonical_parent, ambient_authority())
            .map_err(|error| format!("cannot open workspace parent directory: {error}"))?;
        Ok(Self {
            parent,
            parent_path: canonical_parent,
            name,
        })
    }

    fn inspect(&self) -> Result<(WorkspaceKind, Option<Dir>), String> {
        match self.parent.symlink_metadata(&self.name) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                Ok((WorkspaceKind::NonemptyInvalid, None))
            }
            Ok(_) => {
                let root = self.parent.open_dir_nofollow(&self.name).map_err(|error| {
                    format!("cannot open workspace without following symbolic links: {error}")
                })?;
                let empty = root
                    .entries()
                    .map_err(|error| format!("cannot inspect workspace: {error}"))?
                    .next()
                    .is_none();
                let kind = if empty {
                    WorkspaceKind::Empty
                } else if held_workspace_is_careerops(&root) {
                    WorkspaceKind::Careerops
                } else {
                    WorkspaceKind::NonemptyInvalid
                };
                Ok((kind, Some(root)))
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                Ok((WorkspaceKind::Missing, None))
            }
            Err(error) => Err(format!("cannot inspect workspace: {error}")),
        }
    }
}

static NEXT_BOOTSTRAP_STAGE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn create_staging_root(parent: &Dir) -> Result<(OsString, Dir), String> {
    loop {
        let name = OsString::from(format!(
            ".careerops-workspace-stage-{}-{}",
            std::process::id(),
            NEXT_BOOTSTRAP_STAGE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        match parent.create_dir(&name) {
            Ok(()) => {
                let directory = parent
                    .open_dir_nofollow(&name)
                    .map_err(|error| format!("cannot open workspace staging directory: {error}"))?;
                return Ok((name, directory));
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "cannot create workspace staging directory: {error}"
                ))
            }
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn install_staging_root(
    parent: &Dir,
    _parent_path: &Path,
    staging: &OsStr,
    target: &OsStr,
) -> io::Result<()> {
    rustix::fs::renameat_with(
        parent,
        staging,
        parent,
        target,
        rustix::fs::RenameFlags::NOREPLACE,
    )
    .map_err(Into::into)
}

#[cfg(windows)]
fn windows_directory_identity(
    handle: windows_sys::Win32::Foundation::HANDLE,
) -> io::Result<(u64, u64)> {
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };

    let mut information = BY_HANDLE_FILE_INFORMATION::default();
    if unsafe { GetFileInformationByHandle(handle, &mut information) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok((
        u64::from(information.dwVolumeSerialNumber),
        (u64::from(information.nFileIndexHigh) << 32) | u64::from(information.nFileIndexLow),
    ))
}

#[cfg(windows)]
fn pin_windows_parent(
    parent: &Dir,
    parent_path: &Path,
) -> io::Result<std::os::windows::io::OwnedHandle> {
    use cap_fs_ext::MetadataExt;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::FromRawHandle;
    use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ,
        FILE_SHARE_WRITE, OPEN_EXISTING,
    };

    let path: Vec<u16> = parent_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let raw = unsafe {
        CreateFileW(
            path.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            std::ptr::null_mut(),
        )
    };
    if raw == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error());
    }
    let handle = unsafe { std::os::windows::io::OwnedHandle::from_raw_handle(raw) };
    let metadata = parent.dir_metadata()?;
    let capability_identity = (metadata.dev(), metadata.ino());
    use std::os::windows::io::AsRawHandle;
    if windows_directory_identity(handle.as_raw_handle())? != capability_identity {
        return Err(io::Error::other(
            "workspace parent path does not identify the held parent capability",
        ));
    }
    Ok(handle)
}

#[cfg(windows)]
fn install_staging_root(
    parent: &Dir,
    parent_path: &Path,
    staging: &OsStr,
    target: &OsStr,
) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::MoveFileW;

    let _parent_pin = pin_windows_parent(parent, parent_path)?;

    let source: Vec<u16> = parent_path
        .join(staging)
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let destination: Vec<u16> = parent_path
        .join(target)
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    if unsafe { MoveFileW(source.as_ptr(), destination.as_ptr()) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn install_staging_root(
    _parent: &Dir,
    _parent_path: &Path,
    _staging: &OsStr,
    _target: &OsStr,
) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "atomic no-replace workspace installation is unavailable",
    ))
}

fn initialize_workspace_from_seed_with_hook<F>(
    workspace: &Path,
    seed: &Path,
    mut hook: F,
) -> Result<WorkspaceInitResult, String>
where
    F: FnMut(BootstrapEvent) -> Result<(), String>,
{
    let path = workspace.to_string_lossy().into_owned();
    if !CAREEROPS_SYSTEM_INVARIANTS
        .iter()
        .all(|relative| seed.join(relative).is_file())
    {
        return Err(format!(
            "packaged workspace seed is invalid: {}",
            seed.display()
        ));
    }
    let location = WorkspaceLocation::open(workspace)?;
    let (kind, root) = location.inspect()?;
    match kind {
        WorkspaceKind::Careerops => {
            return Ok(WorkspaceInitResult {
                path,
                created: false,
            })
        }
        WorkspaceKind::NonemptyInvalid => {
            return Err(format!(
                "target is not a CareerOps workspace: {}",
                workspace.display()
            ));
        }
        WorkspaceKind::Empty => {
            let held = HeldWorkspace {
                parent: location
                    .parent
                    .try_clone()
                    .map_err(|error| format!("cannot retain workspace parent: {error}"))?,
                name: location.name.clone(),
                root: root.expect("empty workspace has an open directory"),
            };
            let mut guarded_hook = |event| {
                hook(event)?;
                held.validate_entry()
            };
            let _created = populate_empty_root(&held.root, seed, &mut guarded_hook)?;
        }
        WorkspaceKind::Missing => {
            let (staging_name, staging_root) = create_staging_root(&location.parent)?;
            let staging_metadata = staging_root
                .dir_metadata()
                .map_err(|error| format!("cannot inspect workspace staging directory: {error}"))?;
            let staging_entry = created_entry(
                &location.parent,
                &staging_name,
                CreatedEntryKind::Directory,
                &staging_metadata,
            )?;
            let staged_entries = match populate_empty_root(&staging_root, seed, &mut hook) {
                Ok(entries) => entries,
                Err(error) => {
                    let rollback = rollback_created_entries(&[staging_entry]);
                    return Err(if rollback.is_empty() {
                        error
                    } else {
                        format!(
                            "{error}; staging cleanup incomplete: {}",
                            rollback.join("; ")
                        )
                    });
                }
            };
            if let Err(error) = hook(BootstrapEvent::BeforeMissingRootInstall(
                staging_name.clone(),
            )) {
                let _ = rollback_created_entries(&staged_entries);
                let _ = rollback_created_entries(&[staging_entry]);
                return Err(error);
            }
            let current_staging = match location.parent.open_dir_nofollow(&staging_name) {
                Ok(current) => current,
                Err(error) => {
                    let _ = rollback_created_entries(&staged_entries);
                    let _ = rollback_created_entries(&[staging_entry]);
                    return Err(format!(
                        "workspace staging directory changed before install: {error}"
                    ));
                }
            };
            if !same_cap_directory(&staging_root, &current_staging)? {
                let _ = rollback_created_entries(&staged_entries);
                let _ = rollback_created_entries(&[staging_entry]);
                return Err(
                    "workspace staging directory identity changed before install".to_owned(),
                );
            }
            match location.parent.symlink_metadata(&location.name) {
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Ok(_) => {
                    let _ = rollback_created_entries(&staged_entries);
                    let _ = rollback_created_entries(&[staging_entry]);
                    return Err("workspace target changed before atomic install".to_owned());
                }
                Err(error) => {
                    let _ = rollback_created_entries(&staged_entries);
                    let _ = rollback_created_entries(&[staging_entry]);
                    return Err(format!(
                        "cannot inspect workspace before atomic install: {error}"
                    ));
                }
            }
            if let Err(error) = install_staging_root(
                &location.parent,
                &location.parent_path,
                &staging_name,
                &location.name,
            ) {
                let _ = rollback_created_entries(&staged_entries);
                let _ = rollback_created_entries(&[staging_entry]);
                return Err(format!("cannot atomically install workspace: {error}"));
            }
            hook(BootstrapEvent::AfterMissingRootInstall)?;
            let installed = location
                .parent
                .open_dir_nofollow(&location.name)
                .map_err(|error| {
                    format!("installed workspace changed before validation: {error}")
                })?;
            if !same_cap_directory(&staging_root, &installed)? {
                return Err("installed workspace directory identity changed".to_owned());
            }
        }
    }
    Ok(WorkspaceInitResult {
        path,
        created: true,
    })
}

pub fn initialize_workspace_from_seed(
    workspace: &Path,
    seed: &Path,
) -> Result<WorkspaceInitResult, String> {
    initialize_workspace_from_seed_with_hook(workspace, seed, |event| {
        match event {
            BootstrapEvent::BeforeEntry(relative) => {
                let _ = relative.as_os_str();
            }
            BootstrapEvent::BeforeMissingRootInstall(staging_name) => {
                let _ = staging_name.as_os_str();
            }
            BootstrapEvent::AfterMissingRootInstall => {}
        }
        Ok(())
    })
}

fn write_file_if_missing(directory: &Dir, filename: &str, contents: &[u8]) -> Result<(), String> {
    match directory.symlink_metadata(filename) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err("onboarding destination must not be a symlink".to_owned());
        }
        Ok(metadata) if metadata.is_file() => return Ok(()),
        Ok(_) => return Err("onboarding destination must be a regular file".to_owned()),
        Err(error) if error.kind() != io::ErrorKind::NotFound => {
            return Err(format!("cannot inspect onboarding destination: {error}"));
        }
        Err(_) => {}
    }

    let mut options = CapOpenOptions::new();
    options
        .write(true)
        .create_new(true)
        .follow(FollowSymlinks::No);
    match directory.open_with(filename, &options) {
        Ok(mut file) => file
            .write_all(contents)
            .map_err(|error| format!("cannot write onboarding scaffold: {error}")),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            let metadata = directory
                .symlink_metadata(filename)
                .map_err(|error| format!("cannot inspect onboarding destination: {error}"))?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err("onboarding destination must be a regular file".to_owned());
            }
            Ok(())
        }
        Err(error) => Err(format!("cannot create onboarding scaffold: {error}")),
    }
}

fn regular_file_exists(directory: &Dir, filename: &str) -> Result<bool, String> {
    match directory.symlink_metadata(filename) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Err("onboarding destination must not be a symlink".to_owned())
        }
        Ok(metadata) if metadata.is_file() => Ok(true),
        Ok(_) => Err("onboarding destination must be a regular file".to_owned()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("cannot inspect onboarding destination: {error}")),
    }
}

#[derive(Clone, Copy)]
struct TextLine {
    start: usize,
    content_end: usize,
    end: usize,
}

fn text_lines(source: &str) -> Vec<TextLine> {
    let mut lines = Vec::new();
    let mut start = 0;
    while start < source.len() {
        let end = source[start..]
            .find('\n')
            .map(|offset| start + offset + 1)
            .unwrap_or(source.len());
        let content_end = if end > start && source.as_bytes()[end - 1] == b'\n' {
            if end > start + 1 && source.as_bytes()[end - 2] == b'\r' {
                end - 2
            } else {
                end - 1
            }
        } else {
            end
        };
        lines.push(TextLine {
            start,
            content_end,
            end,
        });
        start = end;
    }
    lines
}

fn valid_analysis_language(language: &str) -> bool {
    let mut parts = language.split('-');
    let Some(primary) = parts.next() else {
        return false;
    };
    if !(2..=3).contains(&primary.len()) || !primary.bytes().all(|byte| byte.is_ascii_alphabetic())
    {
        return false;
    }
    parts.all(|part| {
        (2..=8).contains(&part.len()) && part.bytes().all(|byte| byte.is_ascii_alphanumeric())
    })
}

fn line_starts_with_indented_key(line: &str, key: &str) -> Option<usize> {
    let indent = line
        .as_bytes()
        .iter()
        .take_while(|byte| matches!(byte, b' ' | b'\t'))
        .count();
    line[indent..].starts_with(key).then_some(indent)
}

fn replace_language_line(source: &str, line: TextLine, indent: usize, language: &str) -> String {
    let mut updated = String::with_capacity(source.len() + language.len());
    updated.push_str(&source[..line.start]);
    updated.push_str(&source[line.start..line.start + indent]);
    updated.push_str("analysis: ");
    updated.push_str(language);
    updated.push_str(&source[line.content_end..]);
    updated
}

fn set_analysis_language_in_profile(source: &str, language: &str) -> String {
    let lines = text_lines(source);
    let Some(header_index) = lines
        .iter()
        .position(|line| source[line.start..line.content_end].starts_with("language:"))
    else {
        let separator = if !source.is_empty() && !source.ends_with('\n') {
            "\n"
        } else {
            ""
        };
        return format!("{source}{separator}\nlanguage:\n  analysis: {language}\n");
    };

    let mut block_end = header_index + 1;
    while block_end < lines.len() {
        let line = &source[lines[block_end].start..lines[block_end].content_end];
        if line.is_empty() || line.starts_with([' ', '\t']) {
            block_end += 1;
        } else {
            break;
        }
    }

    for line in &lines[header_index + 1..block_end] {
        let content = &source[line.start..line.content_end];
        if let Some(indent) = line_starts_with_indented_key(content, "analysis:") {
            return replace_language_line(source, *line, indent, language);
        }
    }
    for line in &lines[header_index + 1..block_end] {
        let content = &source[line.start..line.content_end];
        if let Some(indent) = line_starts_with_indented_key(content, "output:") {
            return replace_language_line(source, *line, indent, language);
        }
    }

    let header = lines[header_index];
    let newline = if header.end > header.content_end {
        &source[header.content_end..header.end]
    } else {
        "\n"
    };
    let mut updated = String::with_capacity(source.len() + language.len() + newline.len() + 12);
    updated.push_str(&source[..header.end]);
    updated.push_str(newline);
    updated.push_str("  analysis: ");
    updated.push_str(language);
    updated.push('\n');
    updated.push_str(&source[header.end..]);
    updated
}

fn read_file_or_empty(directory: &Dir, filename: &str) -> Result<String, String> {
    match directory.symlink_metadata(filename) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Err("analysis language profile must not be a symlink".to_owned())
        }
        Ok(metadata) if !metadata.is_file() => {
            Err("analysis language profile must be a regular file".to_owned())
        }
        Ok(_) => {
            let mut file = open_file_nofollow(directory, std::ffi::OsStr::new(filename))
                .map_err(|error| format!("cannot read analysis language profile: {error}"))?;
            let mut contents = String::new();
            file.read_to_string(&mut contents)
                .map_err(|error| format!("cannot read analysis language profile: {error}"))?;
            Ok(contents)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("cannot inspect analysis language profile: {error}")),
    }
}

fn write_profile_contents(directory: &Dir, contents: &str) -> Result<(), String> {
    let mut options = CapOpenOptions::new();
    match directory.symlink_metadata("profile.yml") {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err("analysis language profile must not be a symlink".to_owned());
        }
        Ok(metadata) if !metadata.is_file() => {
            return Err("analysis language profile must be a regular file".to_owned());
        }
        Ok(_) => {
            options
                .write(true)
                .truncate(true)
                .follow(FollowSymlinks::No);
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            options
                .write(true)
                .create_new(true)
                .follow(FollowSymlinks::No);
        }
        Err(error) => return Err(format!("cannot inspect analysis language profile: {error}")),
    }
    let mut file = directory
        .open_with("profile.yml", &options)
        .map_err(|error| format!("cannot write analysis language profile: {error}"))?;
    file.write_all(contents.as_bytes())
        .map_err(|error| format!("cannot write analysis language profile: {error}"))
}

pub fn set_analysis_language_at(workspace: &Path, language: &str) -> Result<(), String> {
    let language = language.trim();
    if !valid_analysis_language(language) {
        return Err("analysis language must be an ISO language tag".to_owned());
    }
    if inspect_workspace_path(workspace)? != WorkspaceKind::Careerops {
        return Err("target is not a CareerOps workspace".to_owned());
    }
    let workspace = Dir::open_ambient_dir(workspace, ambient_authority())
        .map_err(|error| format!("cannot open workspace directory: {error}"))?;
    let config = open_or_create_directory(&workspace, "config")?;
    let source = read_file_or_empty(&config, "profile.yml")?;
    write_profile_contents(
        &config,
        &set_analysis_language_in_profile(&source, language),
    )
}

#[tauri::command]
pub fn set_analysis_language(path: String, language: String) -> Result<(), String> {
    set_analysis_language_at(Path::new(&path), &language)
}

pub fn prepare_onboarding_workspace_at(workspace: &Path) -> Result<(), String> {
    if inspect_workspace_path(workspace)? != WorkspaceKind::Careerops {
        return Err("target is not a CareerOps workspace".to_owned());
    }

    let workspace = Dir::open_ambient_dir(workspace, ambient_authority())
        .map_err(|error| format!("cannot open workspace directory: {error}"))?;
    let config = open_or_create_directory(&workspace, "config")?;
    let modes = open_or_create_directory(&workspace, "modes")?;

    write_file_if_missing(&workspace, "cv.md", EMPTY_CV_SCAFFOLD.as_bytes())?;
    write_file_if_missing(&config, "profile.yml", NEUTRAL_PROFILE_SCAFFOLD.as_bytes())?;
    write_file_if_missing(
        &modes,
        "_profile.md",
        NEUTRAL_PROFILE_MODE_SCAFFOLD.as_bytes(),
    )?;
    write_file_if_missing(
        &workspace,
        "portals.yml",
        NEUTRAL_PORTALS_SCAFFOLD.as_bytes(),
    )?;
    if !regular_file_exists(&workspace, "applications.md")? {
        let data = open_or_create_directory(&workspace, "data")?;
        write_file_if_missing(
            &data,
            "applications.md",
            APPLICATIONS_TRACKER_SCAFFOLD.as_bytes(),
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn prepare_onboarding_workspace(root: String) -> Result<(), String> {
    prepare_onboarding_workspace_at(Path::new(&root))
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
        assert!(workspace.join("documents/others").is_dir());
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
    fn a_mid_copy_failure_rolls_back_an_empty_root_and_retry_is_clean() {
        let workspace = TempDir::new("empty-init-failure");
        let seed = seed();

        let error =
            initialize_workspace_from_seed_with_hook(workspace.path(), seed.path(), |event| {
                match event {
                    BootstrapEvent::BeforeEntry(relative)
                        if relative == Path::new("modes/_shared.md") =>
                    {
                        Err("injected copy failure".to_owned())
                    }
                    _ => Ok(()),
                }
            })
            .expect_err("injected copy failure must abort initialization");

        assert!(error.contains("injected copy failure"));
        assert_eq!(fs::read_dir(workspace.path()).unwrap().count(), 0);

        let result = initialize_workspace_from_seed(workspace.path(), seed.path()).unwrap();
        assert!(result.created);
        assert_eq!(
            fs::read_to_string(workspace.path().join("modes/_shared.md")).unwrap(),
            "seed mode\n"
        );
    }

    #[test]
    fn raced_entries_are_preserved_and_bootstrap_rolls_back_its_own_files() {
        for raced_kind in ["file", "directory"] {
            let workspace = TempDir::new(&format!("empty-init-raced-{raced_kind}"));
            let seed = seed();
            let error = initialize_workspace_from_seed_with_hook(
                workspace.path(),
                seed.path(),
                |event| {
                    if matches!(event, BootstrapEvent::BeforeEntry(ref relative) if relative == Path::new("doctor.mjs")) {
                        let raced = workspace.path().join("doctor.mjs");
                        if raced_kind == "file" {
                            fs::write(raced, "raced user bytes\n").unwrap();
                        } else {
                            fs::create_dir(raced).unwrap();
                        }
                    }
                    Ok(())
                },
            )
            .expect_err("raced destination must abort initialization");

            assert!(error.contains("doctor.mjs") || error.contains("workspace"));
            if raced_kind == "file" {
                assert_eq!(
                    fs::read_to_string(workspace.path().join("doctor.mjs")).unwrap(),
                    "raced user bytes\n"
                );
            } else {
                assert!(workspace.path().join("doctor.mjs").is_dir());
            }
            assert!(!workspace.path().join("modes/_shared.md").exists());
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_raced_symlink_is_preserved_without_touching_its_target() {
        let workspace = TempDir::new("empty-init-raced-link");
        let external = TempDir::new("empty-init-raced-link-external");
        let external_doctor = external.path().join("doctor.mjs");
        fs::write(&external_doctor, "external bytes\n").unwrap();
        let seed = seed();

        let error = initialize_workspace_from_seed_with_hook(
            workspace.path(),
            seed.path(),
            |event| {
                if matches!(event, BootstrapEvent::BeforeEntry(ref relative) if relative == Path::new("doctor.mjs")) {
                    std::os::unix::fs::symlink(&external_doctor, workspace.path().join("doctor.mjs"))
                        .unwrap();
                }
                Ok(())
            },
        )
        .expect_err("raced link must abort initialization");

        assert!(error.contains("doctor.mjs") || error.contains("workspace"));
        assert_eq!(
            fs::read_to_string(external_doctor).unwrap(),
            "external bytes\n"
        );
        assert!(fs::symlink_metadata(workspace.path().join("doctor.mjs"))
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn missing_root_install_never_replaces_a_raced_target() {
        for raced_kind in ["file", "directory", "symlink"] {
            let parent = TempDir::new(&format!("missing-install-raced-{raced_kind}"));
            let workspace = parent.path().join("CareerOps");
            let external = TempDir::new(&format!("missing-install-raced-{raced_kind}-external"));
            fs::write(external.path().join("sentinel"), "external\n").unwrap();
            let seed = seed();

            let error =
                initialize_workspace_from_seed_with_hook(&workspace, seed.path(), |event| {
                    if matches!(event, BootstrapEvent::BeforeMissingRootInstall(_)) {
                        match raced_kind {
                            "file" => fs::write(&workspace, "raced root\n").unwrap(),
                            "directory" => fs::create_dir(&workspace).unwrap(),
                            "symlink" => {
                                std::os::unix::fs::symlink(external.path(), &workspace).unwrap()
                            }
                            _ => unreachable!(),
                        }
                    }
                    Ok(())
                })
                .expect_err("no-replace install must reject a raced root");

            assert!(
                error.contains("changed") || error.contains("install") || error.contains("exists")
            );
            assert_eq!(
                fs::read_to_string(external.path().join("sentinel")).unwrap(),
                "external\n"
            );
            match raced_kind {
                "file" => assert_eq!(fs::read_to_string(&workspace).unwrap(), "raced root\n"),
                "directory" => assert_eq!(fs::read_dir(&workspace).unwrap().count(), 0),
                "symlink" => assert!(fs::symlink_metadata(&workspace)
                    .unwrap()
                    .file_type()
                    .is_symlink()),
                _ => unreachable!(),
            }
        }
    }

    #[test]
    fn missing_root_install_rejects_a_replacement_of_the_staging_name() {
        for replacement_kind in ["file", "directory"] {
            let parent = TempDir::new(&format!("missing-stage-replaced-{replacement_kind}"));
            let workspace = parent.path().join("CareerOps");
            let seed = seed();
            let mut held_staging = None;

            let error =
                initialize_workspace_from_seed_with_hook(&workspace, seed.path(), |event| {
                    if let BootstrapEvent::BeforeMissingRootInstall(ref staging_name) = event {
                        let staging = parent.path().join(staging_name);
                        let held = parent.path().join(format!("held-stage-{replacement_kind}"));
                        fs::rename(&staging, &held).unwrap();
                        held_staging = Some(held);
                        if replacement_kind == "file" {
                            fs::write(&staging, "raced staging file\n").unwrap();
                        } else {
                            fs::create_dir(&staging).unwrap();
                            fs::write(staging.join("raced"), "raced staging directory\n").unwrap();
                        }
                    }
                    Ok(())
                })
                .expect_err("a replaced staging name must not be installed");

            assert!(
                error.contains("staging") || error.contains("changed"),
                "{error}"
            );
            assert!(!workspace.exists());
            let held = held_staging.expect("hook observed staging name");
            assert!(held.is_dir());
        }
    }

    #[cfg(unix)]
    #[test]
    fn missing_root_install_rejects_a_symlink_replacing_the_staging_name() {
        let parent = TempDir::new("missing-stage-replaced-symlink");
        let external = TempDir::new("missing-stage-replaced-symlink-external");
        let workspace = parent.path().join("CareerOps");
        let seed = seed();

        let error = initialize_workspace_from_seed_with_hook(&workspace, seed.path(), |event| {
            if let BootstrapEvent::BeforeMissingRootInstall(ref staging_name) = event {
                let staging = parent.path().join(staging_name);
                fs::rename(&staging, parent.path().join("held-stage")).unwrap();
                std::os::unix::fs::symlink(external.path(), staging).unwrap();
            }
            Ok(())
        })
        .expect_err("a staging symlink replacement must not be installed");

        assert!(
            error.contains("staging") || error.contains("changed"),
            "{error}"
        );
        assert!(!workspace.exists());
        assert_eq!(fs::read_dir(external.path()).unwrap().count(), 0);
    }

    #[test]
    fn missing_root_install_validates_the_installed_directory_identity() {
        let parent = TempDir::new("missing-install-identity-race");
        let workspace = parent.path().join("CareerOps");
        let moved = parent.path().join("installed-stage-moved");
        let seed = seed();

        let error = initialize_workspace_from_seed_with_hook(&workspace, seed.path(), |event| {
            if matches!(event, BootstrapEvent::AfterMissingRootInstall) {
                fs::rename(&workspace, &moved).unwrap();
                fs::create_dir(&workspace).unwrap();
                fs::write(workspace.join("raced"), "later root\n").unwrap();
            }
            Ok(())
        })
        .expect_err("a post-install replacement must fail identity validation");

        assert!(
            error.contains("identity") || error.contains("changed"),
            "{error}"
        );
        assert_eq!(
            fs::read_to_string(workspace.join("raced")).unwrap(),
            "later root\n"
        );
        assert!(moved.join("doctor.mjs").is_file());
    }

    #[cfg(windows)]
    #[test]
    fn windows_parent_pin_is_identity_bound_to_the_capability_parent() {
        let parent = TempDir::new("windows-parent-pin");
        let workspace = parent.path().join("CareerOps");
        let location = WorkspaceLocation::open(&workspace).unwrap();

        let _pin: std::os::windows::io::OwnedHandle =
            pin_windows_parent(&location.parent, &location.parent_path).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn windows_pinned_install_is_explicitly_no_replace() {
        let parent = TempDir::new("windows-pinned-no-replace");
        let workspace = parent.path().join("CareerOps");
        let location = WorkspaceLocation::open(&workspace).unwrap();
        location.parent.create_dir("staged").unwrap();
        location.parent.create_dir("CareerOps").unwrap();

        install_staging_root(
            &location.parent,
            &location.parent_path,
            OsStr::new("staged"),
            OsStr::new("CareerOps"),
        )
        .expect_err("pinned Windows installation must not replace a destination");

        assert!(location.parent.open_dir_nofollow("staged").is_ok());
        assert!(location.parent.open_dir_nofollow("CareerOps").is_ok());
    }

    #[test]
    fn prepares_missing_onboarding_scaffolds_without_overwriting_user_files() {
        let workspace = TempDir::new("prepare-onboarding");
        mark_as_careerops(workspace.path(), "export {};\n");
        fs::write(workspace.path().join("cv.md"), "user CV\n").unwrap();

        prepare_onboarding_workspace_at(workspace.path()).unwrap();

        assert_eq!(
            fs::read_to_string(workspace.path().join("cv.md")).unwrap(),
            "user CV\n"
        );
        assert_eq!(
            fs::read_to_string(workspace.path().join("config/profile.yml")).unwrap(),
            "# CareerOps profile\n# Add only your confirmed details; empty fields are intentional.\ncandidate:\n  full_name: \"\"\n  email: \"\"\ntarget_roles:\n  primary: []\n  archetypes: []\nnarrative:\n  superpowers: []\n  proof_points: []\ncompensation: {}\nlocation: {}\nlanguage:\n  analysis: en\nspend_tier: standard\n"
        );
        assert_eq!(
            fs::read_to_string(workspace.path().join("modes/_profile.md")).unwrap(),
            "# User Profile Context\n\nAdd only your confirmed targeting, narrative, and proof points here.\n"
        );
        assert_eq!(
            fs::read_to_string(workspace.path().join("portals.yml")).unwrap(),
            "# CareerOps portal configuration\n# Add target roles and companies before scanning.\ntitle_filter:\n  positive: []\ntracked_companies: []\n"
        );
        let profile = fs::read_to_string(workspace.path().join("config/profile.yml")).unwrap();
        assert!(!profile.contains("Jane Smith"));
        assert!(!profile.contains("jane@example.com"));
        assert!(
            fs::read_to_string(workspace.path().join("data/applications.md"))
                .unwrap()
                .starts_with("# Applications Tracker\n")
        );

        fs::write(
            workspace.path().join("config/profile.yml"),
            "language: en\n",
        )
        .unwrap();
        fs::write(workspace.path().join("portals.yml"), "companies: user\n").unwrap();
        fs::write(
            workspace.path().join("data/applications.md"),
            "# User tracker\n",
        )
        .unwrap();
        prepare_onboarding_workspace_at(workspace.path()).unwrap();

        assert_eq!(
            fs::read_to_string(workspace.path().join("config/profile.yml")).unwrap(),
            "language: en\n"
        );
        assert_eq!(
            fs::read_to_string(workspace.path().join("portals.yml")).unwrap(),
            "companies: user\n"
        );
        assert_eq!(
            fs::read_to_string(workspace.path().join("data/applications.md")).unwrap(),
            "# User tracker\n"
        );
    }

    #[test]
    fn preserves_a_legacy_root_tracker_without_creating_a_data_tracker() {
        let workspace = TempDir::new("prepare-legacy-tracker");
        mark_as_careerops(workspace.path(), "export {};\n");
        fs::write(
            workspace.path().join("applications.md"),
            "# Legacy tracker\n",
        )
        .unwrap();

        prepare_onboarding_workspace_at(workspace.path()).unwrap();

        assert_eq!(
            fs::read_to_string(workspace.path().join("applications.md")).unwrap(),
            "# Legacy tracker\n"
        );
        assert!(!workspace.path().join("data/applications.md").exists());
    }

    #[test]
    fn updates_only_the_analysis_language_and_migrates_legacy_output() {
        let workspace = TempDir::new("analysis-language");
        mark_as_careerops(workspace.path(), "export {};\n");
        fs::write(
            workspace.path().join("config/profile.yml"),
            "candidate:\n  full_name: \"User\"\nlanguage:\n  output: de\nspend_tier: standard\n",
        )
        .unwrap();

        set_analysis_language_at(workspace.path(), " fr ").unwrap();

        assert_eq!(
            fs::read_to_string(workspace.path().join("config/profile.yml")).unwrap(),
            "candidate:\n  full_name: \"User\"\nlanguage:\n  analysis: fr\nspend_tier: standard\n"
        );
    }

    #[test]
    fn preserves_legacy_language_header_insertion_semantics() {
        assert_eq!(
            set_analysis_language_in_profile("language:\nspend_tier: standard\n", "fr"),
            "language:\n\n  analysis: fr\nspend_tier: standard\n"
        );
        assert_eq!(
            set_analysis_language_in_profile("language:\r\nspend_tier: standard\r\n", "fr"),
            "language:\r\n\r\n  analysis: fr\nspend_tier: standard\r\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlinked_profile_before_analysis_language_write() {
        let workspace = TempDir::new("analysis-language-profile-symlink");
        let external = TempDir::new("analysis-language-profile-external");
        mark_as_careerops(workspace.path(), "export {};\n");
        let external_profile = external.path().join("profile.yml");
        fs::write(&external_profile, "language:\n  analysis: de\n").unwrap();
        std::os::unix::fs::symlink(
            &external_profile,
            workspace.path().join("config/profile.yml"),
        )
        .unwrap();

        let error = set_analysis_language_at(workspace.path(), "fr").unwrap_err();

        assert!(error.contains("symlink"));
        assert_eq!(
            fs::read_to_string(external_profile).unwrap(),
            "language:\n  analysis: de\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlinked_config_directory_before_analysis_language_write() {
        let workspace = TempDir::new("analysis-language-config-symlink");
        let external = TempDir::new("analysis-language-config-external");
        mark_as_careerops(workspace.path(), "export {};\n");
        fs::copy(
            workspace.path().join("config/profile.example.yml"),
            external.path().join("profile.example.yml"),
        )
        .unwrap();
        fs::remove_dir_all(workspace.path().join("config")).unwrap();
        let external_profile = external.path().join("profile.yml");
        fs::write(&external_profile, "language:\n  analysis: de\n").unwrap();
        std::os::unix::fs::symlink(external.path(), workspace.path().join("config")).unwrap();

        let error = set_analysis_language_at(workspace.path(), "fr").unwrap_err();

        assert!(error.contains("without following links"), "{error}");
        assert_eq!(
            fs::read_to_string(external_profile).unwrap(),
            "language:\n  analysis: de\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlinked_onboarding_destination_without_touching_its_target() {
        let workspace = TempDir::new("prepare-symlink");
        let external = TempDir::new("prepare-symlink-external");
        mark_as_careerops(workspace.path(), "export {};\n");
        let external_profile = external.path().join("profile.yml");
        fs::write(&external_profile, "external profile\n").unwrap();
        std::os::unix::fs::symlink(
            &external_profile,
            workspace.path().join("config/profile.yml"),
        )
        .unwrap();

        let error = prepare_onboarding_workspace_at(workspace.path()).unwrap_err();

        assert!(error.contains("symlink"));
        assert_eq!(
            fs::read_to_string(external_profile).unwrap(),
            "external profile\n"
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
        mark_as_careerops(workspace.path(), "export {};\n");
        let source_dir = TempDir::new("stage-source");
        let source = source_dir.path().join("resume.pdf");
        fs::write(&source, "original CV").unwrap();

        let staged = stage_intake_files(workspace.path(), &[stage_file(&source, "cv")]).unwrap();

        let destination = workspace.path().join("documents/cv/resume.pdf");
        assert_eq!(staged.len(), 1);
        assert!(!staged[0].duplicate);
        assert_eq!(PathBuf::from(&staged[0].destination_path), destination);
        assert_eq!(fs::read_to_string(&source).unwrap(), "original CV");
        assert_eq!(fs::read_to_string(destination).unwrap(), "original CV");
    }

    #[test]
    fn rejects_a_category_that_would_escape_documents() {
        let workspace = TempDir::new("stage-traversal");
        mark_as_careerops(workspace.path(), "export {};\n");
        let source_dir = TempDir::new("stage-traversal-source");
        let source = source_dir.path().join("resume.pdf");
        fs::write(&source, "original CV").unwrap();

        let error =
            stage_intake_files(workspace.path(), &[stage_file(&source, "../config")]).unwrap_err();

        assert!(error.contains("category"));
        assert!(!workspace.path().join("config/resume.pdf").exists());
    }

    #[test]
    fn refuses_to_stage_into_an_arbitrary_directory() {
        let workspace = TempDir::new("stage-invalid-root");
        let source_dir = TempDir::new("stage-invalid-root-source");
        let source = source_dir.path().join("resume.pdf");
        fs::write(&source, "original CV").unwrap();

        let error = stage_intake_files(workspace.path(), &[stage_file(&source, "cv")])
            .expect_err("arbitrary directory must not become an intake workspace");

        assert!(error.contains("CareerOps workspace"));
        assert!(!workspace.path().join("documents").exists());
    }

    #[cfg(unix)]
    #[test]
    fn staging_rejects_a_workspace_replacement_before_copy() {
        let parent = TempDir::new("stage-replaced-root-parent");
        let workspace = parent.path().join("CareerOps");
        fs::create_dir(&workspace).unwrap();
        mark_as_careerops(&workspace, "export {};\n");
        let held = parent.path().join("CareerOps-held");
        let source_dir = TempDir::new("stage-replaced-root-source");
        let source = source_dir.path().join("resume.pdf");
        fs::write(&source, "original CV").unwrap();

        let error = stage_intake_files_with_hook(&workspace, &[stage_file(&source, "cv")], || {
            fs::rename(&workspace, &held).unwrap();
            fs::create_dir(&workspace).unwrap();
            fs::write(workspace.join("sentinel"), "replacement\n").unwrap();
        })
        .expect_err("replaced workspace path must fail closed");

        assert!(error.contains("changed") || error.contains("CareerOps workspace"));
        assert_eq!(
            fs::read_to_string(workspace.join("sentinel")).unwrap(),
            "replacement\n"
        );
        assert!(!workspace.join("documents/cv/resume.pdf").exists());
        assert!(!held.join("documents/cv/resume.pdf").exists());
    }

    #[test]
    fn skips_an_existing_file_with_identical_content() {
        let workspace = TempDir::new("stage-duplicate");
        mark_as_careerops(workspace.path(), "export {};\n");
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
            workspace.path().join("documents/diplomas/master.pdf")
        );
        assert_eq!(fs::read_to_string(second).unwrap(), "same content");
    }

    #[test]
    fn suffixes_same_named_files_with_different_content_deterministically() {
        let workspace = TempDir::new("stage-collision");
        mark_as_careerops(workspace.path(), "export {};\n");
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
            workspace.path().join("documents/diplomas/master-2.pdf")
        );
        assert_eq!(
            PathBuf::from(&third_result[0].destination_path),
            workspace.path().join("documents/diplomas/master-3.pdf")
        );
        assert_eq!(
            fs::read_to_string(workspace.path().join("documents/diplomas/master.pdf")).unwrap(),
            "first"
        );
    }

    #[cfg(unix)]
    #[test]
    fn held_category_directory_does_not_follow_a_replacement_symlink() {
        let workspace = TempDir::new("stage-held-directory");
        let source_dir = TempDir::new("stage-held-directory-source");
        let external = TempDir::new("stage-held-directory-external");
        let source = source_dir.path().join("resume.pdf");
        fs::write(&source, "original CV").unwrap();
        let external_resume = external.path().join("resume.pdf");
        fs::write(&external_resume, "external evidence").unwrap();

        let category_path = workspace.path().join("documents/cv");
        let category_directory = open_category_directory(workspace.path(), "cv").unwrap();
        let held_category_path = workspace.path().join("documents/cv-held");
        fs::rename(&category_path, &held_category_path).unwrap();
        std::os::unix::fs::symlink(external.path(), &category_path).unwrap();

        let staged = stage_file_in_category(
            &source.to_string_lossy(),
            &source,
            "cv",
            &category_directory,
            &category_path,
        )
        .unwrap();

        assert_eq!(
            staged.destination_path,
            category_path.join("resume.pdf").to_string_lossy()
        );
        assert_eq!(
            fs::read_to_string(held_category_path.join("resume.pdf")).unwrap(),
            "original CV"
        );
        assert_eq!(
            fs::read_to_string(&external_resume).unwrap(),
            "external evidence"
        );
        assert!(!external.path().join("resume-2.pdf").exists());

        category_directory.remove_file("resume.pdf").unwrap();
        assert!(!held_category_path.join("resume.pdf").exists());
        assert_eq!(
            fs::read_to_string(&external_resume).unwrap(),
            "external evidence"
        );
    }

    #[test]
    fn lists_regular_files_under_dropped_folders_and_skips_dotfiles() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("materials");
        fs::create_dir_all(folder.join("nested")).unwrap();
        fs::write(folder.join("cv.pdf"), b"pdf").unwrap();
        fs::write(folder.join("nested/reference.md"), b"md").unwrap();
        fs::write(folder.join(".DS_Store"), b"junk").unwrap();
        fs::write(root.path().join("single.txt"), b"txt").unwrap();

        let listed = list_intake_candidates_at(&[
            folder.to_string_lossy().into_owned(),
            root.path().join("single.txt").to_string_lossy().into_owned(),
            folder.to_string_lossy().into_owned(),
        ]);

        assert_eq!(listed, vec![
            folder.join("cv.pdf").to_string_lossy().into_owned(),
            folder.join("nested/reference.md").to_string_lossy().into_owned(),
            root.path().join("single.txt").to_string_lossy().into_owned(),
        ]);
    }

    #[test]
    fn save_job_capture_writes_under_jds_with_a_safe_name() {
        let root = tempfile::tempdir().unwrap();
        let rel = save_job_capture_at(root.path(), "2026-09-02_Acme GmbH_Project/Lead", "JD text").unwrap();
        assert!(rel.starts_with("jds/2026-09-02_acme-gmbh_project-lead"));
        assert!(rel.ends_with(".md"));
        assert_eq!(fs::read_to_string(root.path().join(&rel)).unwrap(), "JD text");
        assert!(save_job_capture_at(root.path(), "../escape", "x").unwrap().starts_with("jds/escape"));
    }

    #[test]
    fn save_job_capture_truncates_a_very_long_slug() {
        let root = tempfile::tempdir().unwrap();
        let long_title = "a".repeat(300);
        let rel = save_job_capture_at(root.path(), &long_title, "JD text").unwrap();
        // "jds/" (4) + up to 80 slug chars + ".md" (3).
        assert!(rel.len() <= 4 + 80 + 3, "expected a capped filename, got {rel:?} ({} chars)", rel.len());
        assert_eq!(fs::read_to_string(root.path().join(&rel)).unwrap(), "JD text");
    }

    #[cfg(unix)]
    #[test]
    fn save_job_capture_rejects_a_symlinked_jds_directory() {
        let root = tempfile::tempdir().unwrap();
        let real_dir = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(real_dir.path(), root.path().join("jds")).unwrap();

        let error = save_job_capture_at(root.path(), "slug", "text").unwrap_err();

        assert!(error.contains("symlink"));
    }

    #[cfg(unix)]
    #[test]
    fn save_job_capture_skips_a_dangling_symlinked_collision() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("jds")).unwrap();
        std::os::unix::fs::symlink(
            root.path().join("jds/does-not-exist.md"),
            root.path().join("jds/slug.md"),
        )
        .unwrap();

        let rel = save_job_capture_at(root.path(), "slug", "JD text").unwrap();

        assert_eq!(rel, "jds/slug-2.md");
        assert_eq!(fs::read_to_string(root.path().join(&rel)).unwrap(), "JD text");
        assert!(fs::symlink_metadata(root.path().join("jds/slug.md"))
            .unwrap()
            .file_type()
            .is_symlink());
    }
}
