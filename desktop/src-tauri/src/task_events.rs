use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Clone, Debug)]
pub struct TaskEvent {
    pub task_id: String,
    pub kind: String,
    /// Short form for the activity feed (truncated to 200 chars).
    pub summary: String,
    pub tool: Option<String>,
    pub target: Option<String>,
    pub is_error: Option<bool>,
    /// The untruncated text of a `text` or `result` event, for screens that
    /// show the AI's reply itself (interview sessions) rather than a feed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

fn truncate(text: &str, max: usize) -> String {
    let mut out: String = text.chars().take(max).collect();
    if text.chars().count() > max {
        out.push('…');
    }
    out
}

fn event(task_id: &str, kind: &str, summary: String) -> TaskEvent {
    TaskEvent {
        task_id: task_id.to_owned(),
        kind: kind.to_owned(),
        summary,
        tool: None,
        target: None,
        is_error: None,
        text: None,
    }
}

/// A `text`/`result` event: truncated summary for the feed, full text kept.
fn text_event(task_id: &str, kind: &str, text: &str) -> TaskEvent {
    let mut e = event(task_id, kind, truncate(text, 200));
    e.text = Some(text.to_owned());
    e
}

fn tool_target(input: &Value) -> Option<String> {
    for key in [
        "file_path",
        "url",
        "command",
        "path",
        "pattern",
        "query",
        "description",
    ] {
        if let Some(v) = input.get(key).and_then(Value::as_str) {
            return Some(truncate(v, 80));
        }
    }
    None
}

/// Maps Antigravity CLI tool names onto the Claude Code names the frontend
/// summariser already understands; unknown names pass through unchanged.
fn agy_tool_name(name: &str) -> String {
    match name {
        "run_command" => "Bash",
        "view_file" | "view_file_outline" | "view_code_item" | "read_file" => "Read",
        "write_to_file" => "Write",
        "replace_file_content" | "multi_replace_file_content" | "edit_file" => "Edit",
        "find_by_name" | "list_dir" => "Glob",
        "grep_search" => "Grep",
        "read_url_content" => "WebFetch",
        "search_web" => "WebSearch",
        other => other,
    }
    .to_owned()
}

fn agy_tool_target(parameters: &Value) -> Option<String> {
    for key in [
        "CommandLine",
        "AbsolutePath",
        "TargetFile",
        "Url",
        "Pattern",
        "Query",
        "SearchDirectory",
        "DirectoryPath",
    ] {
        if let Some(v) = parameters.get(key).and_then(Value::as_str) {
            return Some(truncate(v, 80));
        }
    }
    None
}

/// Antigravity CLI (`agy --output-format stream-json`) emits
/// `{"event":"step_update","step_update":{...}}` and `{"event":"result","result":{...}}`.
fn parse_agy(task_id: &str, event_name: &str, value: &Value) -> Option<TaskEvent> {
    match event_name {
        "result" => {
            let result = value.get("result")?;
            let status = result.get("status").and_then(Value::as_str).unwrap_or("");
            let mut e = text_event(
                task_id,
                "result",
                result.get("response").and_then(Value::as_str).unwrap_or(""),
            );
            e.is_error = Some(status != "SUCCESS");
            Some(e)
        }
        "step_update" => {
            let step = value.get("step_update")?;
            if step.get("step_type").and_then(Value::as_str) != Some("tool") {
                return None;
            }
            // ACTIVE marks the call starting; DONE repeats the same call with output.
            if step.get("state").and_then(Value::as_str) != Some("ACTIVE") {
                return None;
            }
            let raw_name = step.get("tool_name").and_then(Value::as_str)?;
            let name = agy_tool_name(raw_name);
            let mut e = event(task_id, "tool", name.clone());
            e.target = step.pointer("/tool_info/parameters").and_then(agy_tool_target);
            e.tool = Some(name);
            Some(e)
        }
        _ => None,
    }
}

pub fn parse_line(task_id: &str, line: &str) -> Option<TaskEvent> {
    let value: Value = serde_json::from_str(line.trim()).ok()?;
    if let Some(event_name) = value.get("event").and_then(Value::as_str) {
        return parse_agy(task_id, event_name, &value);
    }
    let kind = value.get("type").and_then(Value::as_str).unwrap_or("");

    if value.get("total_cost_usd").is_some() || kind == "result" {
        let mut e = text_event(
            task_id,
            "result",
            value.get("result").and_then(Value::as_str).unwrap_or(""),
        );
        e.is_error = value.get("is_error").and_then(Value::as_bool);
        return Some(e);
    }
    match kind {
        "system" => {
            if value.get("subtype").and_then(Value::as_str) != Some("task_summary") {
                return None;
            }
            let detail = value.get("detail").and_then(Value::as_str)?;
            Some(event(task_id, "status", truncate(detail, 200)))
        }
        "assistant" => {
            let blocks = value.pointer("/message/content")?.as_array()?;
            for block in blocks {
                match block.get("type").and_then(Value::as_str) {
                    Some("tool_use") => {
                        let name = block.get("name").and_then(Value::as_str)?.to_owned();
                        let mut e = event(task_id, "tool", name.clone());
                        e.target = block.get("input").and_then(tool_target);
                        e.tool = Some(name);
                        return Some(e);
                    }
                    Some("text") => {
                        let text = block.get("text").and_then(Value::as_str)?;
                        if text.trim().is_empty() {
                            continue;
                        }
                        return Some(text_event(task_id, "text", text));
                    }
                    _ => continue,
                }
            }
            None
        }
        "item.completed" => {
            let item = value.get("item")?;
            match item.get("type").and_then(Value::as_str) {
                Some("command_execution") => {
                    let command = item.get("command").and_then(Value::as_str).unwrap_or("");
                    let mut e = event(task_id, "tool", "Bash".into());
                    e.tool = Some("Bash".into());
                    e.target = Some(truncate(command, 80));
                    Some(e)
                }
                Some("file_change") => {
                    let path = item
                        .pointer("/changes/0/path")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    let mut e = event(task_id, "tool", "Write".into());
                    e.tool = Some("Write".into());
                    e.target = Some(truncate(path, 80));
                    Some(e)
                }
                Some("agent_message") => Some(text_event(
                    task_id,
                    "text",
                    item.get("text").and_then(Value::as_str).unwrap_or(""),
                )),
                _ => None,
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_agy_tool_steps_once_with_a_normalised_name() {
        let active = r#"{"event":"step_update","step_update":{"conversation_id":"c","step_index":2,"state":"ACTIVE","step_type":"tool","tool_name":"run_command","tool_info":{"name":"run_command","parameters":{"CommandLine":"pwd && ls -la"}}}}"#;
        let e = parse_line("t", active).unwrap();
        assert_eq!((e.kind.as_str(), e.tool.as_deref()), ("tool", Some("Bash")));
        assert_eq!(e.target.as_deref(), Some("pwd && ls -la"));
        let done = r#"{"event":"step_update","step_update":{"state":"DONE","step_type":"tool","tool_name":"run_command","tool_info":{"parameters":{"CommandLine":"pwd"},"output":"x"}}}"#;
        assert!(parse_line("t", done).is_none());
        let find = r#"{"event":"step_update","step_update":{"state":"ACTIVE","step_type":"tool","tool_name":"find_by_name","tool_info":{"parameters":{"Pattern":"sample.txt","SearchDirectory":"/w"}}}}"#;
        let f = parse_line("t", find).unwrap();
        assert_eq!((f.tool.as_deref(), f.target.as_deref()), (Some("Glob"), Some("sample.txt")));
    }

    #[test]
    fn ignores_agy_noise_and_maps_result() {
        assert!(parse_line("t", r#"{"event":"init","conversation_id":"c","init":{"cwd":"/w","tools":[]}}"#).is_none());
        assert!(parse_line("t", r#"{"event":"step_update","step_update":{"state":"DONE","step_type":"agent_response","text_delta":"ok"}}"#).is_none());
        let ok = r#"{"event":"result","result":{"conversation_id":"c","status":"SUCCESS","response":"ok\n","num_turns":1}}"#;
        let e = parse_line("t", ok).unwrap();
        assert_eq!((e.kind.as_str(), e.is_error, e.summary.as_str()), ("result", Some(false), "ok\n"));
        let bad = r#"{"event":"result","result":{"status":"ERROR","response":""}}"#;
        assert_eq!(parse_line("t", bad).unwrap().is_error, Some(true));
    }

    #[test]
    fn maps_task_summary_to_status() {
        let line = r#"{"type":"system","subtype":"task_summary","detail":"Reading sample.txt","uuid":"x","session_id":"s"}"#;
        let e = parse_line("t", line).unwrap();
        assert_eq!((e.kind.as_str(), e.summary.as_str()), ("status", "Reading sample.txt"));
    }

    #[test]
    fn ignores_task_summary_with_null_detail_and_noise() {
        assert!(parse_line("t", r#"{"type":"system","subtype":"task_summary","detail":null}"#).is_none());
        assert!(parse_line("t", r#"{"type":"rate_limit_event","rate_limit_info":{}}"#).is_none());
        assert!(parse_line("t", r#"{"type":"user","message":{"content":[{"type":"tool_result"}]}}"#).is_none());
        assert!(parse_line("t", "plain text line").is_none());
    }

    #[test]
    fn maps_tool_use_with_target() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"x","name":"Read","input":{"file_path":"/w/reports/042-acme.md"}}]}}"#;
        let e = parse_line("t", line).unwrap();
        assert_eq!(e.kind, "tool");
        assert_eq!(e.tool.as_deref(), Some("Read"));
        assert_eq!(e.target.as_deref(), Some("/w/reports/042-acme.md"));
    }

    #[test]
    fn maps_text_and_result() {
        let text = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Done writing the report."}]}}"#;
        assert_eq!(parse_line("t", text).unwrap().kind, "text");
        let result = r#"{"duration_api_ms":1,"is_error":false,"result":"ok","total_cost_usd":0.01,"type":"result"}"#;
        let e = parse_line("t", result).unwrap();
        assert_eq!(e.kind, "result");
        assert_eq!(e.is_error, Some(false));
    }

    #[test]
    fn keeps_the_full_reply_text_beside_the_truncated_summary() {
        let long = "x".repeat(600);
        let claude = format!(r#"{{"type":"assistant","message":{{"content":[{{"type":"text","text":"{long}"}}]}}}}"#);
        let e = parse_line("t", &claude).unwrap();
        assert_eq!(e.summary.chars().count(), 201);
        assert_eq!(e.text.as_deref(), Some(long.as_str()));
        let result = format!(r#"{{"type":"result","is_error":false,"result":"{long}","total_cost_usd":0.01}}"#);
        assert_eq!(parse_line("t", &result).unwrap().text.as_deref(), Some(long.as_str()));
        let codex = format!(r#"{{"type":"item.completed","item":{{"type":"agent_message","text":"{long}"}}}}"#);
        assert_eq!(parse_line("t", &codex).unwrap().text.as_deref(), Some(long.as_str()));
        let agy = format!(r#"{{"event":"result","result":{{"status":"SUCCESS","response":"{long}"}}}}"#);
        assert_eq!(parse_line("t", &agy).unwrap().text.as_deref(), Some(long.as_str()));
        let tool = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"x","name":"Read","input":{}}]}}"#;
        assert!(parse_line("t", tool).unwrap().text.is_none());
    }

    #[test]
    fn maps_codex_items() {
        let cmd = r#"{"type":"item.completed","item":{"type":"command_execution","command":"node merge-tracker.mjs","status":"completed"}}"#;
        let e = parse_line("t", cmd).unwrap();
        assert_eq!((e.kind.as_str(), e.tool.as_deref()), ("tool", Some("Bash")));
        let file = r#"{"type":"item.completed","item":{"type":"file_change","changes":[{"path":"reports/042.md","kind":"add"}]}}"#;
        assert_eq!(parse_line("t", file).unwrap().target.as_deref(), Some("reports/042.md"));
        let msg = r#"{"type":"item.completed","item":{"type":"agent_message","text":"All done."}}"#;
        assert_eq!(parse_line("t", msg).unwrap().kind, "text");
    }
}
