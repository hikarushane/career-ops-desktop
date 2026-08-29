use std::ffi::OsString;
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

pub fn stage_intake_files(
    workspace: &Path,
    files: &[StageIntakeFile],
) -> Result<Vec<StagedIntakeFile>, String> {
    let workspace_directory = Dir::open_ambient_dir(workspace, ambient_authority())
        .map_err(|error| format!("cannot open workspace directory: {error}"))?;
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

        let category_directory =
            open_category_directory_in_workspace(&workspace_directory, category)?;
        let destination_directory = workspace.join("documents").join(category);
        staged.push(stage_file_in_category(
            &file.source_path,
            source,
            category,
            &category_directory,
            &destination_directory,
        )?);
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
            workspace.path().join("documents/diplomas/master.pdf")
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
}
