use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Clone, Debug)]
pub struct TaskEvent {
    pub task_id: String,
    pub kind: String,
    pub summary: String,
    pub tool: Option<String>,
    pub target: Option<String>,
    pub is_error: Option<bool>,
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
    }
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

pub fn parse_line(task_id: &str, line: &str) -> Option<TaskEvent> {
    let value: Value = serde_json::from_str(line.trim()).ok()?;
    let kind = value.get("type").and_then(Value::as_str).unwrap_or("");

    if value.get("total_cost_usd").is_some() || kind == "result" {
        let mut e = event(
            task_id,
            "result",
            truncate(value.get("result").and_then(Value::as_str).unwrap_or(""), 200),
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
                        return Some(event(task_id, "text", truncate(text, 200)));
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
                Some("agent_message") => Some(event(
                    task_id,
                    "text",
                    truncate(item.get("text").and_then(Value::as_str).unwrap_or(""), 200),
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
