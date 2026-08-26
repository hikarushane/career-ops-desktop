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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LanguageContext {
    analysis_language: Option<String>,
    job_language: Option<String>,
    job_language_confidence: Option<f32>,
    job_language_source: Option<String>,
    market_mode: Option<String>,
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

fn is_language_tag(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.split('-').all(|part| {
            !part.is_empty() && part.chars().all(|character| character.is_ascii_alphanumeric())
        })
}

fn language_context_instruction(context: Option<&LanguageContext>) -> Result<String, String> {
    let Some(context) = context else {
        return Ok(
            "LanguageContext was not supplied by this caller. Read language.analysis from config/profile.yml "
            .to_owned()
                + "(legacy language.output is read-only compatibility), resolve each job's JD language with "
                + "job-language.mjs, and keep market modes separate.",
        );
    };

    let analysis_language = context.analysis_language.as_deref().unwrap_or("en");
    if !is_language_tag(analysis_language) {
        return Err("invalid analysis language in LanguageContext".to_owned());
    }

    let job_language = match context.job_language.as_deref() {
        Some(language) if is_language_tag(language) => language,
        Some(_) => return Err("invalid job language in LanguageContext".to_owned()),
        None => "auto (resolve from this job's JD body)",
    };
    if let Some(confidence) = context.job_language_confidence {
        if !(0.0..=1.0).contains(&confidence) {
            return Err("job-language confidence must be between 0 and 1".to_owned());
        }
    }
    if let Some(source) = context.job_language_source.as_deref() {
        if source.len() > 64 || !source.chars().all(|character| character.is_ascii_alphanumeric() || character == '-') {
            return Err("invalid job-language source in LanguageContext".to_owned());
        }
    }
    if let Some(market_mode) = context.market_mode.as_deref() {
        if market_mode.len() > 128 || market_mode.chars().any(|character| matches!(character, '\r' | '\n' | '\0')) {
            return Err("invalid market mode in LanguageContext".to_owned());
        }
    }

    Ok(format!(
        "Structured LanguageContext: analysisLanguage={}; jobLanguage={}; marketMode={}. \
         Evaluation reports and dashboard explanations use analysisLanguage. Tailored CVs, cover \
         letters, and interview materials use jobLanguage. When jobLanguage is auto, resolve it \
         from this job's JD body with job-language.mjs after extraction; do not infer it from the \
         URL, company country, location, or title. Keep machine-readable keys stable.",
        analysis_language,
        job_language,
        context.market_mode.as_deref().unwrap_or("profile-configured"),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunTaskInput {
    task_type: String,
    provider_id: String,
    args: HashMap<String, String>,
    path: String,
    language_context: Option<LanguageContext>,
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

    let language_instruction = language_context_instruction(input.language_context.as_ref())?;
    let prompt = format!("{}\n\n{}", build_prompt(task_def.prompt_template, &input.args), language_instruction);

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

#[cfg(test)]
mod tests {
    use super::{language_context_instruction, LanguageContext};

    #[test]
    fn structured_context_keeps_analysis_and_artifact_languages_separate() {
        let instruction = language_context_instruction(Some(&LanguageContext {
            analysis_language: Some("de".to_owned()),
            job_language: Some("en".to_owned()),
            job_language_confidence: Some(0.92),
            job_language_source: Some("jd-text".to_owned()),
            market_mode: Some("modes/de".to_owned()),
        }))
        .expect("valid language context");

        assert!(instruction.contains("analysisLanguage=de"));
        assert!(instruction.contains("jobLanguage=en"));
        assert!(instruction.contains("marketMode=modes/de"));
        assert!(instruction.contains("Evaluation reports and dashboard explanations use analysisLanguage"));
        assert!(instruction.contains("Tailored CVs, cover letters, and interview materials use jobLanguage"));
    }

    #[test]
    fn absent_context_preserves_legacy_cli_fallback() {
        let instruction = language_context_instruction(None).expect("legacy fallback prompt");
        assert!(instruction.contains("language.analysis"));
        assert!(instruction.contains("legacy language.output"));
        assert!(instruction.contains("resolve each job's JD language"));
    }
}
