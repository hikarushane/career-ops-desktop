//! Opens a *visible* terminal running a provider's official installer and then
//! its login command.
//!
//! The previous path ran `npm install -g …` hidden inside the sidecar, which
//! failed on any machine without Node and gave the user nothing to read. Here
//! the user watches the vendor's own script run and signs in themselves.
//!
//! Trust boundary: the frontend passes only a provider id, and that id is used
//! solely as a lookup key into the table below — never interpolated into a
//! command line, a script, or a file name. Every executed string is a
//! compile-time constant from `PROVIDERS`; a test asserts those constants carry
//! no shell metacharacter that could start a nested command (`"`, a backtick,
//! or `$(`), so no future edit can smuggle one in. Arguments are passed as a
//! vector to `Command::args`, never joined into a shell string, and program
//! paths are absolute (with a bare-name fallback only when the absolute path is
//! absent) so a hostile PATH entry cannot stand in for the interpreter.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Target platform. Passed explicitly so the table is testable everywhere.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
    Windows,
    MacOs,
    Linux,
}

/// A ready-to-spawn terminal launch plus the human-readable command line the
/// user will see run (shown in the UI as a copyable fallback).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invocation {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub display: String,
}

/// The one and only source of truth for what gets executed.
struct ProviderCommands {
    id: &'static str,
    /// macOS and Linux installer one-liner (the vendor's documented command).
    unix_install: &'static str,
    /// Windows PowerShell installer one-liner.
    windows_install: &'static str,
    /// Command that starts the vendor's own sign-in flow.
    login: &'static str,
    /// Fixed launcher file name used on macOS. A constant, never built from
    /// the caller-supplied id.
    macos_launcher: &'static str,
}

const PROVIDERS: &[ProviderCommands] = &[
    ProviderCommands {
        id: "claude",
        unix_install: "curl -fsSL https://claude.ai/install.sh | bash",
        windows_install: "irm https://claude.ai/install.ps1 | iex",
        login: "claude auth login",
        macos_launcher: "install-claude.command",
    },
    ProviderCommands {
        id: "codex",
        unix_install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
        windows_install: "irm https://chatgpt.com/codex/install.ps1 | iex",
        login: "codex login",
        macos_launcher: "install-codex.command",
    },
    ProviderCommands {
        id: "agy",
        unix_install: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
        windows_install: "irm https://antigravity.google/cli/install.ps1 | iex",
        login: "agy",
        macos_launcher: "install-agy.command",
    },
];

fn lookup(id: &str) -> Result<&'static ProviderCommands, String> {
    PROVIDERS
        .iter()
        .find(|provider| provider.id == id)
        .ok_or_else(|| format!("unknown provider: {id}"))
}

/// `powershell.exe` under `%SystemRoot%`, falling back to the bare name only
/// when that file is absent (a stripped-down or relocated Windows install).
fn windows_powershell() -> PathBuf {
    if let Some(root) = std::env::var_os("SystemRoot") {
        let absolute = Path::new(&root)
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe");
        if absolute.is_file() {
            return absolute;
        }
    }
    PathBuf::from("powershell.exe")
}

/// macOS `open(1)`, falling back to the bare name only when absent.
fn macos_open() -> PathBuf {
    let absolute = Path::new("/usr/bin/open");
    if absolute.is_file() {
        absolute.to_path_buf()
    } else {
        PathBuf::from("open")
    }
}

/// The installers append `~/.local/bin` to the *persisted* user PATH, which the
/// already-running PowerShell session cannot see; re-reading both scopes makes
/// the freshly installed binary resolvable for the login command that follows.
fn windows_script(provider: &ProviderCommands) -> String {
    format!(
        "{install}; $env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine'); {login}",
        install = provider.windows_install,
        login = provider.login,
    )
}

/// Body of the macOS `.command` file. `exec "$SHELL" -l` keeps the Terminal
/// window open afterwards with the new PATH, so a failure stays readable.
fn macos_script(provider: &ProviderCommands) -> String {
    format!(
        "#!/bin/bash\n{install}\nexport PATH=\"$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH\"\n{login}\nexec \"$SHELL\" -l\n",
        install = provider.unix_install,
        login = provider.login,
    )
}

fn linux_script(provider: &ProviderCommands) -> String {
    format!(
        "{install}; {login}; exec bash",
        install = provider.unix_install,
        login = provider.login,
    )
}

fn display_line(install: &str, login: &str) -> String {
    format!("{install} ; {login}")
}

/// Writes the macOS launcher, then re-stats it and refuses to launch anything
/// that is not an executable regular file — a failed write or chmod must reach
/// the UI as an error with the website fallback, not as a silent no-op.
fn write_macos_launcher(
    provider: &ProviderCommands,
    app_data_dir: &Path,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("could not create {}: {error}", app_data_dir.display()))?;
    let file = app_data_dir.join(provider.macos_launcher);
    std::fs::write(&file, macos_script(provider))
        .map_err(|error| format!("could not write {}: {error}", file.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("could not set permissions on {}: {error}", file.display()))?;
    }

    let metadata = std::fs::metadata(&file)
        .map_err(|error| format!("could not stat {}: {error}", file.display()))?;
    if !metadata.is_file() {
        return Err(format!("{} is not a regular file", file.display()));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o100 == 0 {
            return Err(format!("{} is not executable", file.display()));
        }
    }
    Ok(file)
}

/// Builds the launch plan for `id` on `os`. Pure apart from the macOS launcher
/// file, which is why `app_data_dir` is a parameter rather than read from the
/// app handle here.
pub fn installer_invocation(
    id: &str,
    os: Os,
    app_data_dir: &Path,
) -> Result<Invocation, String> {
    let provider = lookup(id)?;

    match os {
        Os::Windows => Ok(Invocation {
            program: windows_powershell(),
            args: vec![
                "-NoProfile".into(),
                "-NoExit".into(),
                "-Command".into(),
                windows_script(provider),
            ],
            display: display_line(provider.windows_install, provider.login),
        }),
        Os::MacOs => {
            let file = write_macos_launcher(provider, app_data_dir)?;
            Ok(Invocation {
                program: macos_open(),
                args: vec![file.to_string_lossy().into_owned()],
                display: display_line(provider.unix_install, provider.login),
            })
        }
        Os::Linux => Ok(Invocation {
            program: PathBuf::from("x-terminal-emulator"),
            args: vec![
                "-e".into(),
                "bash".into(),
                "-lc".into(),
                linux_script(provider),
            ],
            display: display_line(provider.unix_install, provider.login),
        }),
    }
}

fn current_os() -> Os {
    #[cfg(windows)]
    {
        Os::Windows
    }
    #[cfg(target_os = "macos")]
    {
        Os::MacOs
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Os::Linux
    }
}

fn launch_error(invocation: &Invocation, error: impl std::fmt::Display) -> String {
    format!(
        "could not open a terminal for `{}`: {error}",
        invocation.display
    )
}

/// Spawns the terminal. On Windows the child gets `CREATE_NEW_CONSOLE` and
/// nothing else — deliberately not `runner::hide_console`, whose
/// `CREATE_NO_WINDOW` would hide the very window the user needs to read.
fn launch(invocation: &Invocation) -> Result<(), String> {
    let mut command = Command::new(&invocation.program);
    command.args(&invocation.args);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        command.creation_flags(CREATE_NEW_CONSOLE);
    }

    #[cfg(target_os = "macos")]
    {
        // `open` returns as soon as Terminal has the file; a non-zero exit
        // means no window appeared, which the user must be told about.
        let status = command
            .status()
            .map_err(|error| launch_error(invocation, error))?;
        if !status.success() {
            return Err(launch_error(invocation, format!("exit status {status}")));
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        command
            .spawn()
            .map_err(|error| launch_error(invocation, error))?;
        Ok(())
    }
}

/// Opens a terminal window running `id`'s official installer and login command.
/// Returns the command line that was launched, for the UI to display.
#[tauri::command]
pub fn open_provider_installer(app: tauri::AppHandle, id: String) -> Result<String, String> {
    use tauri::Manager;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("could not resolve the app data directory: {error}"))?;
    let invocation = installer_invocation(&id, current_os(), &app_data_dir)?;
    launch(&invocation)?;
    Ok(invocation.display)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> tempfile::TempDir {
        tempfile::tempdir().expect("tempdir")
    }

    fn windows_expected(install: &str, login: &str) -> Vec<String> {
        vec![
            "-NoProfile".to_string(),
            "-NoExit".to_string(),
            "-Command".to_string(),
            format!(
                "{install}; $env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine'); {login}"
            ),
        ]
    }

    #[test]
    fn windows_launches_powershell_with_the_table_command() {
        let dir = temp();
        let cases = [
            ("claude", "irm https://claude.ai/install.ps1 | iex", "claude auth login"),
            ("codex", "irm https://chatgpt.com/codex/install.ps1 | iex", "codex login"),
            ("agy", "irm https://antigravity.google/cli/install.ps1 | iex", "agy"),
        ];
        for (id, install, login) in cases {
            let invocation = installer_invocation(id, Os::Windows, dir.path()).expect(id);
            assert_eq!(invocation.args, windows_expected(install, login), "{id}");
            assert_eq!(invocation.display, format!("{install} ; {login}"), "{id}");
            assert_eq!(
                invocation.program.file_name().and_then(|n| n.to_str()),
                Some("powershell.exe"),
                "{id}"
            );
            assert_eq!(invocation.program, windows_powershell(), "{id}");
        }
    }

    #[test]
    fn linux_launches_a_terminal_emulator_with_the_table_command() {
        let dir = temp();
        let cases = [
            ("claude", "curl -fsSL https://claude.ai/install.sh | bash", "claude auth login"),
            ("codex", "curl -fsSL https://chatgpt.com/codex/install.sh | sh", "codex login"),
            ("agy", "curl -fsSL https://antigravity.google/cli/install.sh | bash", "agy"),
        ];
        for (id, install, login) in cases {
            let invocation = installer_invocation(id, Os::Linux, dir.path()).expect(id);
            assert_eq!(invocation.program, PathBuf::from("x-terminal-emulator"), "{id}");
            assert_eq!(
                invocation.args,
                vec![
                    "-e".to_string(),
                    "bash".to_string(),
                    "-lc".to_string(),
                    format!("{install}; {login}; exec bash"),
                ],
                "{id}"
            );
            assert_eq!(invocation.display, format!("{install} ; {login}"), "{id}");
        }
    }

    #[test]
    fn macos_writes_an_executable_launcher_and_opens_it() {
        let dir = temp();
        let nested = dir.path().join("careerops-app-data");
        let cases = [
            ("claude", "install-claude.command", "curl -fsSL https://claude.ai/install.sh | bash", "claude auth login"),
            ("codex", "install-codex.command", "curl -fsSL https://chatgpt.com/codex/install.sh | sh", "codex login"),
            ("agy", "install-agy.command", "curl -fsSL https://antigravity.google/cli/install.sh | bash", "agy"),
        ];
        for (id, file_name, install, login) in cases {
            let invocation = installer_invocation(id, Os::MacOs, &nested).expect(id);
            let expected = nested.join(file_name);

            assert_eq!(
                invocation.args,
                vec![expected.to_string_lossy().into_owned()],
                "{id}"
            );
            assert_eq!(invocation.display, format!("{install} ; {login}"), "{id}");
            assert_eq!(
                invocation.program.file_name().and_then(|n| n.to_str()),
                Some("open"),
                "{id}"
            );
            assert_eq!(invocation.program, macos_open(), "{id}");

            let body = std::fs::read_to_string(&expected).expect("launcher written");
            assert!(body.starts_with("#!/bin/bash\n"), "{id}");
            assert!(body.contains(install), "{id}");
            assert!(body.contains(login), "{id}");
            assert!(body.ends_with("exec \"$SHELL\" -l\n"), "{id}");

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mode = std::fs::metadata(&expected).unwrap().permissions().mode();
                assert_eq!(mode & 0o777, 0o700, "{id}");
            }
        }
    }

    #[test]
    fn unknown_id_is_rejected_on_every_platform() {
        let dir = temp();
        for os in [Os::Windows, Os::MacOs, Os::Linux] {
            assert_eq!(
                installer_invocation("claude; rm -rf /", os, dir.path()),
                Err("unknown provider: claude; rm -rf /".to_string())
            );
            assert_eq!(
                installer_invocation("", os, dir.path()),
                Err("unknown provider: ".to_string())
            );
        }
        // Nothing was written for an id that is not in the table.
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    /// The executed constants must not be able to open a nested command.
    #[test]
    fn table_constants_carry_no_shell_metacharacters() {
        for provider in PROVIDERS {
            for text in [
                provider.unix_install,
                provider.windows_install,
                provider.login,
                provider.macos_launcher,
            ] {
                assert!(!text.contains('"'), "{text} contains a double quote");
                assert!(!text.contains('`'), "{text} contains a backtick");
                assert!(!text.contains("$("), "{text} contains $(");
            }
        }
    }
}
