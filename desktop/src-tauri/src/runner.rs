use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

pub struct RunnerState {
    pids: Mutex<HashMap<String, u32>>,
    counter: Mutex<u64>,
}

impl RunnerState {
    pub fn new() -> Self {
        Self {
            pids: Mutex::new(HashMap::new()),
            counter: Mutex::new(0),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct TaskStarted {
    task_id: String,
}

#[derive(Serialize, Clone)]
struct TaskOutput {
    task_id: String,
    stream: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct TaskFinished {
    task_id: String,
    exit_code: Option<i32>,
    success: bool,
}

struct TaskDef {
    prompt_template: &'static str,
    required_args: &'static [&'static str],
}

fn get_task_def(task_type: &str) -> Option<TaskDef> {
    match task_type {
        "evaluate" => Some(TaskDef {
            prompt_template: "Evaluate this job posting using auto-pipeline mode: {url}",
            required_args: &["url"],
        }),
        "scan" => Some(TaskDef {
            prompt_template: "Run career-ops scan mode.",
            required_args: &[],
        }),
        "batch" => Some(TaskDef {
            prompt_template: "Run career-ops batch mode to process pending pipeline entries.",
            required_args: &[],
        }),
        "pdf" => Some(TaskDef {
            prompt_template: "Generate a CV/PDF for report {report} using pdf mode.",
            required_args: &["report"],
        }),
        "deep" => Some(TaskDef {
            prompt_template: "Run career-ops deep research mode for {company}.",
            required_args: &["company"],
        }),
        "interview-prep" => Some(TaskDef {
            prompt_template: "Run interview-prep mode for {role} at {company}.",
            required_args: &["company", "role"],
        }),
        "interview-plan" => Some(TaskDef {
            prompt_template: "Run interview/plan mode for the {role} interview at {company}.",
            required_args: &["company", "role"],
        }),
        "interview-practice" => Some(TaskDef {
            prompt_template: "Run interview/practice mode for the {role} role at {company}.",
            required_args: &["company", "role"],
        }),
        "interview-debrief" => Some(TaskDef {
            prompt_template: "Run interview/debrief mode for the recent interview at {company} for {role}.",
            required_args: &["company", "role"],
        }),
        _ => None,
    }
}

fn headless_args(provider_id: &str) -> Option<Vec<&'static str>> {
    match provider_id {
        "claude" => Some(vec!["-p"]),
        "codex" => Some(vec!["exec"]),
        "opencode" => Some(vec!["run"]),
        "copilot" => Some(vec!["-p"]),
        "qwen" => Some(vec!["-p"]),
        "agy" => Some(vec!["-p"]),
        "grok" => Some(vec!["-p"]),
        _ => None,
    }
}

fn build_prompt(template: &str, args: &HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in args {
        result = result.replace(&format!("{{{key}}}"), value);
    }
    result
}

#[derive(Deserialize)]
pub struct RunTaskInput {
    task_type: String,
    provider_id: String,
    args: HashMap<String, String>,
    path: String,
}

#[tauri::command]
pub fn run_task(
    app: AppHandle,
    state: tauri::State<'_, RunnerState>,
    input: RunTaskInput,
) -> Result<TaskStarted, String> {
    let task_def = get_task_def(&input.task_type)
        .ok_or_else(|| format!("unknown task type: {}", input.task_type))?;

    for req in task_def.required_args {
        if !input.args.contains_key(*req) {
            return Err(format!("missing required arg: {req}"));
        }
    }

    let h_args = headless_args(&input.provider_id)
        .ok_or_else(|| format!("unknown provider: {}", input.provider_id))?;

    let prompt = build_prompt(task_def.prompt_template, &input.args);

    let task_id = {
        let mut c = state.counter.lock().map_err(|e| e.to_string())?;
        *c += 1;
        format!("task-{c}")
    };

    let mut cmd_args: Vec<String> = h_args.iter().map(|s| s.to_string()).collect();
    cmd_args.push(prompt);

    let mut child = Command::new(&input.provider_id)
        .args(&cmd_args)
        .current_dir(&input.path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn {}: {e}", input.provider_id))?;

    let pid = child.id();
    {
        let mut pids = state.pids.lock().map_err(|e| e.to_string())?;
        pids.insert(task_id.clone(), pid);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    if let Some(out) = stdout {
        let tid = task_id.clone();
        let a = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().flatten() {
                let _ = a.emit(
                    "task-output",
                    TaskOutput { task_id: tid.clone(), stream: "stdout".into(), data: line },
                );
            }
        });
    }

    if let Some(err) = stderr {
        let tid = task_id.clone();
        let a = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().flatten() {
                let _ = a.emit(
                    "task-output",
                    TaskOutput { task_id: tid.clone(), stream: "stderr".into(), data: line },
                );
            }
        });
    }

    {
        let tid = task_id.clone();
        let a = app.clone();
        std::thread::spawn(move || {
            let exit_code = child.wait().ok().and_then(|s| s.code());
            let _ = a.emit(
                "task-finished",
                TaskFinished {
                    task_id: tid.clone(),
                    exit_code,
                    success: exit_code == Some(0),
                },
            );
            if let Ok(mut pids) = a.state::<RunnerState>().pids.lock() {
                pids.remove(&tid);
            }
        });
    }

    Ok(TaskStarted { task_id })
}

#[tauri::command]
pub fn cancel_task(
    state: tauri::State<'_, RunnerState>,
    task_id: String,
) -> Result<(), String> {
    let pids = state.pids.lock().map_err(|e| e.to_string())?;
    let pid = pids
        .get(&task_id)
        .ok_or_else(|| format!("no running task: {task_id}"))?;

    Command::new("kill")
        .arg(pid.to_string())
        .output()
        .map_err(|e| format!("kill failed: {e}"))?;
    Ok(())
}
