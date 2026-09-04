import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import AgentActivity from '../components/AgentActivity';
import Drawer from '../components/Drawer';
import FilePreview from '../components/FilePreview';
import { loadReportWidth, saveReportWidth } from '../lib/splitResize';
import { cancel, getTask, startTask, useTasks } from '../lib/taskStore';
import { languageSettings, type LanguageContext, type LanguageSettings, type TaskType } from '../api';
import {
  INTAKE_FIELDS, buildContext, findSession, findSessionByTask, intakeComplete, intakeMessage,
  loadSessions, maskTime, replyFromTask, saveSessions, sessionKey, upsertSession,
  type IntakeField, type InterviewMode, type JobFiles, type Session,
} from '../lib/interviewSession';

type Props = {
  root: string;
  mode: InterviewMode;
  company: string;
  role: string;
  /** The job's report and JD capture, named in every turn's prompt. */
  report?: JobFiles;
  initialTaskId?: string | null;
  onBack: () => void;
};

const TITLES: Record<InterviewMode, string> = {
  'interview-plan': 'Interview Prep Plan',
  'interview-practice': 'Practice Interview',
  'interview-debrief': 'Post-Interview Debrief',
};

/**
 * One interview mode as a conversation with the AI (lib/interviewSession.ts).
 * The first turn is an intake form (what the mode's Inputs section needs);
 * every later message is a new agent turn carrying the exchange so far.
 */
export default function InterviewWorkflow({ root, mode, company, role, report, initialTaskId, onBack }: Props) {
  // A reopen from the header chip only carries a task id; find its session
  // by that, else by mode/company/role, else start fresh. A task with no
  // stored session (storage cleared) still gets a one-turn session so its
  // activity shows. The job's files are refreshed from props when known.
  const initial = useMemo<Session>(() => {
    const sessions = loadSessions(root);
    const files = report?.reportPath || report?.reportNumber ? report : undefined;
    const byTask = initialTaskId ? findSessionByTask(sessions, initialTaskId) : null;
    if (byTask) return { ...byTask, files: files ?? byTask.files };
    const task = initialTaskId ? getTask(initialTaskId) : null;
    const c = company || task?.args.company || '';
    const r = role || task?.args.role || '';
    const key = sessionKey(mode, c, r);
    const stored = findSession(sessions, key);
    if (stored && !initialTaskId) return { ...stored, files: files ?? stored.files };
    return {
      key, mode, company: c, role: r, files,
      turns: initialTaskId ? [{ user: task?.label ?? 'Reopened task', taskId: initialTaskId, reply: null }] : (stored?.turns ?? []),
    };
  }, [root, mode, company, role, report, initialTaskId]);

  const [session, setSession] = useState<Session>(initial);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [languages, setLanguages] = useState<LanguageSettings | null>(null);
  const [jobLanguage, setJobLanguage] = useState(initial.jobLanguage ?? '');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // A prep file the candidate opened from a reply, shown in the report drawer.
  const [preview, setPreview] = useState<string | null>(null);
  const [reportWidth, setReportWidth] = useState(() => loadReportWidth(window.innerWidth || 1366));
  const tasks = useTasks();

  useEffect(() => {
    languageSettings(root).then(setLanguages).catch(() => setLanguages(null));
  }, [root]);

  const commit = useCallback((next: Session) => {
    setSession(next);
    saveSessions(root, upsertSession(loadSessions(root), next));
  }, [root]);

  // Capture each finished turn's reply into the session, since a task
  // restored after a restart has no events to read it from later.
  useEffect(() => {
    if (!session.turns.some((t) => t.reply === null)) return;
    let changed = false;
    const turns = session.turns.map((t) => {
      if (t.reply !== null) return t;
      const task = tasks.find((x) => x.taskId === t.taskId);
      if (!task || task.state === 'running') return t;
      const reply = replyFromTask(task);
      if (reply === null) return t;
      changed = true;
      const artifacts = (task.outcome?.artifacts ?? []).filter((a) => a.startsWith('interview-prep/'));
      return { ...t, reply, ...(artifacts.length > 0 ? { artifacts } : {}) };
    });
    if (changed) commit({ ...session, turns });
  }, [tasks, session, commit]);

  const lastTurn = session.turns[session.turns.length - 1];
  const lastTask = lastTurn ? tasks.find((t) => t.taskId === lastTurn.taskId) ?? null : null;
  const busy = lastTask?.state === 'running';

  const languageContext = (): LanguageContext | undefined => (languages
    ? {
        analysisLanguage: languages.analysisLanguage,
        ...(jobLanguage ? { jobLanguage, jobLanguageSource: 'manual-override', jobLanguageConfidence: 1 } : {}),
      }
    : undefined);

  const send = useCallback(async (text: string) => {
    setStartError(null);
    setStarting(true);
    try {
      const context = buildContext(session.turns, text, session.files);
      const id = await startTask(
        mode as TaskType,
        { company: session.company, role: session.role, context },
        root,
        `${TITLES[mode]} · ${session.company}`,
        languageContext(),
      );
      commit({ ...session, jobLanguage: jobLanguage || undefined, turns: [...session.turns, { user: text, taskId: id, reply: null }] });
      setMessage('');
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }, [root, mode, session, languages, jobLanguage, commit]);

  const start = useCallback(() => send(intakeMessage(mode, values)), [send, mode, values]);

  // Re-run the last turn with the task's own args (a reopened task has them;
  // a restored one falls back to rebuilding the context).
  const retry = useCallback(async () => {
    if (!lastTurn) return;
    setStartError(null);
    try {
      const current = getTask(lastTurn.taskId);
      const id = await startTask(
        mode as TaskType,
        current?.args && Object.keys(current.args).length > 0
          ? current.args
          : { company: session.company, role: session.role, context: buildContext(session.turns.slice(0, -1), lastTurn.user, session.files) },
        root,
        current?.label ?? `${TITLES[mode]} · ${session.company}`,
        current?.languageContext ?? languageContext(),
      );
      commit({ ...session, turns: [...session.turns.slice(0, -1), { ...lastTurn, taskId: id, reply: null }] });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    }
  }, [root, mode, session, lastTurn, languages, jobLanguage, commit]);

  const reset = useCallback(() => {
    if (!window.confirm('Start a new conversation? The current one stays in your interview-prep files but leaves this screen.')) return;
    commit({ key: session.key, mode: session.mode, company: session.company, role: session.role, turns: [] });
    setValues({});
    setMessage('');
  }, [session, commit]);

  const field = (f: IntakeField) => {
    const value = values[f.key] ?? '';
    const set = (v: string) => setValues({ ...values, [f.key]: v });
    const id = `intake-${f.key}`;
    return (
      <label key={f.key} htmlFor={id}>
        <span>{f.label}{f.required ? '' : ' (optional)'}</span>
        {f.type === 'textarea' ? (
          <textarea id={id} rows={3} value={value} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />
        ) : f.type === 'select' ? (
          <select id={id} value={value} onChange={(e) => set(e.target.value)}>
            <option value="">{f.required ? 'Choose…' : 'Not sure'}</option>
            {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : f.type === 'time' ? (
          // A plain masked field: the native time control needs a mouse click
          // to move from hours to minutes, this one takes "1430" straight.
          <input id={id} type="text" inputMode="numeric" placeholder="14:30" maxLength={5} value={value} onChange={(e) => set(maskTime(e.target.value))} />
        ) : (
          <input id={id} type={f.type} value={value} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />
        )}
      </label>
    );
  };

  return (
    <div className="eval-screen interview-session">
      <button className="btn-ghost" onClick={onBack}>&larr; Back</button>
      <h1>{TITLES[mode]}</h1>
      <p className="setup-hint">{session.company} &mdash; {session.role}</p>
      {languages && (
        <label className="workflow-language-picker">
          <span>Interview language</span>
          <select value={jobLanguage} onChange={(event) => setJobLanguage(event.target.value)} disabled={session.turns.length > 0}>
            <option value="">Detect from this job's description</option>
            {languages.options.map((option) => (
              <option key={option.code} value={option.code}>{option.name}</option>
            ))}
          </select>
          <small>Practice, planning, and debrief material follow the job language; analysis stays {languages.analysisLanguage}.</small>
        </label>
      )}

      {session.turns.length === 0 ? (
        <form className="preferences-form interview-intake" onSubmit={(e) => { e.preventDefault(); void start(); }}>
          {INTAKE_FIELDS[mode].map(field)}
          <div className="setup-actions">
            <button className="btn-primary" type="submit" disabled={starting || !intakeComplete(mode, values)}>Start</button>
          </div>
        </form>
      ) : (
        <>
          <ol className="chat-thread" aria-label="Conversation">
            {session.turns.map((t) => {
              const task = tasks.find((x) => x.taskId === t.taskId) ?? null;
              return (
                <li key={t.taskId} className="chat-turn">
                  <div className="chat-bubble chat-bubble--sent">{t.user}</div>
                  {t.reply !== null ? (
                    <>
                      <div className="chat-bubble chat-bubble--received"><ReactMarkdown>{t.reply}</ReactMarkdown></div>
                      {t.artifacts && t.artifacts.length > 0 && (
                        <ul className="chat-artifacts" aria-label="Files written">
                          {t.artifacts.map((a) => (
                            <li key={a}><button type="button" className="btn-link" onClick={() => setPreview(a)}>{a}</button></li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : task && (task.state === 'running' || task.state === 'failed') ? (
                    <div className="chat-activity">
                      <AgentActivity task={task} onCancel={() => void cancel(task.taskId)} onRetry={() => void retry()} />
                    </div>
                  ) : (
                    <div className="chat-bubble chat-bubble--received chat-bubble--muted">
                      Reply not captured. The files it wrote are under interview-prep/.
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); void send(message.trim()); }}>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              // Enter sends, Shift+Enter breaks the line (chat convention).
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (!busy && !starting && message.trim()) void send(message.trim());
              }}
              placeholder={busy ? 'Waiting for the AI…' : 'Reply, ask a follow-up, or paste new details (Enter sends, Shift+Enter for a new line)'}
              aria-label="Message"
              disabled={busy}
            />
            <button className="btn-primary" type="submit" disabled={busy || starting || !message.trim()}>Send</button>
          </form>
          <div className="setup-actions">
            <button className="btn-ghost" onClick={onBack}>Done</button>
            <button className="btn-ghost" onClick={reset} disabled={busy}>New conversation</button>
          </div>
        </>
      )}
      {startError && <p className="intake-error" role="alert">{startError}</p>}
      <Drawer
        open={preview !== null}
        onClose={() => setPreview(null)}
        width={reportWidth}
        onResize={setReportWidth}
        onResizeEnd={() => saveReportWidth(reportWidth)}
      >
        {preview && <FilePreview root={root} relative={preview} />}
      </Drawer>
    </div>
  );
}
