/**
 * Interview prep as a conversation. Each message the candidate sends starts
 * one agent task (a "turn"); the AI's reply is the task's final text. The
 * whole exchange so far travels in the next turn's prompt, so every provider
 * works the same way and a session survives closing the app — turns are
 * kept per workspace in localStorage, replies included, because a task
 * restored from a previous session has no events to read the reply from.
 */
import type { TaskEvent } from '../api';
import type { TaskRecord } from './taskStore';

export type InterviewMode = 'interview-plan' | 'interview-practice' | 'interview-debrief';

export type Turn = {
  /** What the candidate sent (the intake summary on the first turn). */
  user: string;
  taskId: string;
  /** The AI's reply once captured; null while the turn runs or if it was lost. */
  reply: string | null;
};

export type Session = {
  key: string;
  mode: InterviewMode;
  company: string;
  role: string;
  turns: Turn[];
  jobLanguage?: string;
};

export type IntakeField = {
  key: string;
  label: string;
  type: 'date' | 'time' | 'text' | 'textarea' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

const ROUNDS = [
  'Recruiter screen',
  'Hiring-manager screen',
  'Technical / domain deep-dive',
  'Design / case study',
  'Behavioral panel',
  'Final round',
];

/** What each mode needs before its first turn — mirrors the Inputs section of modes/interview/*.md. */
export const INTAKE_FIELDS: Record<InterviewMode, IntakeField[]> = {
  'interview-plan': [
    { key: 'date', label: 'Interview date', type: 'date', required: true },
    { key: 'time', label: 'Start time', type: 'time', required: true },
    { key: 'round', label: 'Round type', type: 'select', options: ROUNDS },
    { key: 'interviewers', label: 'Interviewer name(s) and role(s)', type: 'text', placeholder: 'Max Mustermann, Geschäftsführer' },
    { key: 'notes', label: 'Anything else', type: 'textarea', placeholder: 'Format, duration, topics they announced, calendar invite text' },
  ],
  'interview-practice': [
    { key: 'round', label: 'Round type', type: 'select', required: true, options: ROUNDS },
    { key: 'interviewer', label: 'Interviewer persona', type: 'text', placeholder: 'Name, role, company' },
    { key: 'questions', label: 'Questions to practise', type: 'textarea', placeholder: 'Leave empty to let the AI pick from the round type' },
  ],
  'interview-debrief': [
    { key: 'debrief', label: 'How did it go?', type: 'textarea', required: true, placeholder: 'What they asked, how you answered, what felt strong or weak' },
    { key: 'interviewer', label: 'Interviewer name and role', type: 'text' },
    { key: 'outcome', label: 'Outcome so far', type: 'select', options: ['Pending', 'Moved forward', 'Rejected'] },
    { key: 'next', label: 'Next round (if known)', type: 'text', placeholder: 'Format, interviewers, timeline' },
  ],
};

export function sessionKey(mode: InterviewMode, company: string, role: string): string {
  return `${mode}|${company.trim().toLowerCase()}|${role.trim().toLowerCase()}`;
}

/** Whether every required intake field has a value. */
export function intakeComplete(mode: InterviewMode, values: Record<string, string>): boolean {
  return INTAKE_FIELDS[mode].every((f) => !f.required || (values[f.key] ?? '').trim() !== '');
}

/** The first message of a session: the intake answers as a readable list. */
export function intakeMessage(mode: InterviewMode, values: Record<string, string>): string {
  const lines = INTAKE_FIELDS[mode]
    .map((f) => [f.label, (values[f.key] ?? '').trim()] as const)
    .filter(([, v]) => v !== '')
    .map(([label, v]) => `- ${label}: ${v}`);
  return lines.join('\n');
}

/** Bound each quoted reply so the prompt cannot grow without limit. */
const MAX_QUOTED_REPLY = 6000;

function quoted(text: string): string {
  return text.length > MAX_QUOTED_REPLY ? `${text.slice(0, MAX_QUOTED_REPLY)}…` : text;
}

const CHAT_RULES = 'The candidate is talking to you through a chat window and will answer there; do not stop to ask for details already given. Reply in the language the candidate writes in; keep the files you write in the job language as the mode specifies.';

/**
 * The `{context}` block for a turn. First turn: the intake details. Later
 * turns: the exchange so far plus the new message, with instructions to
 * continue rather than restart.
 */
export function buildContext(turns: Turn[], message: string): string {
  if (turns.length === 0) {
    return `\n\nDetails provided by the candidate:\n${message}\n\n${CHAT_RULES} Do the mode's work, then reply with a concise summary of what you wrote and at most three questions whose answers would improve it.`;
  }
  const transcript = turns
    .map((t) => `Candidate:\n${t.user}\n\nYou:\n${quoted(t.reply ?? '(reply not captured)')}`)
    .join('\n\n');
  return `\n\nThis is a continuing conversation. Transcript so far:\n\n${transcript}\n\nThe candidate now says:\n${message}\n\n${CHAT_RULES} Continue the mode's workflow from where the conversation left off: update the prep files if this changes them, and answer the candidate directly. Do not repeat the whole plan.`;
}

/** The AI's reply for a finished turn: the final result text, else the last text block. */
export function replyFromTask(task: TaskRecord | null): string | null {
  if (!task) return null;
  const pick = (kind: TaskEvent['kind']) =>
    [...task.events].reverse().find((e) => e.kind === kind && typeof e.text === 'string' && e.text.trim() !== '')?.text ?? null;
  return pick('result') ?? pick('text') ?? null;
}

// --- persistence -----------------------------------------------------------

function storageKey(root: string) { return `careerops.interviewSessions.${root}`; }

export function loadSessions(root: string): Session[] {
  try {
    const raw = window.localStorage.getItem(storageKey(root));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Session[]) : [];
  } catch {
    return [];
  }
}

export function saveSessions(root: string, sessions: Session[]): void {
  try {
    window.localStorage.setItem(storageKey(root), JSON.stringify(sessions));
  } catch {
    // Storage blocked: the session still lives in memory for this visit.
  }
}

export function findSession(sessions: Session[], key: string): Session | null {
  return sessions.find((s) => s.key === key) ?? null;
}

export function findSessionByTask(sessions: Session[], taskId: string): Session | null {
  return sessions.find((s) => s.turns.some((t) => t.taskId === taskId)) ?? null;
}

/** Replace (or add) one session and return the new list. */
export function upsertSession(sessions: Session[], session: Session): Session[] {
  const others = sessions.filter((s) => s.key !== session.key);
  return [session, ...others];
}
