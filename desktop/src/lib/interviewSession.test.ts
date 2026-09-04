import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildContext, findSession, findSessionByTask, intakeComplete, intakeMessage, loadSessions,
  replyFromTask, saveSessions, sessionKey, upsertSession, type Session, type Turn,
} from './interviewSession';
import type { TaskRecord } from './taskStore';

function task(events: TaskRecord['events']): TaskRecord {
  return {
    taskId: 't', taskType: 'interview-plan', label: '', startedAt: 0, state: 'done', events, rawLog: [],
    outcome: { ok: true, detail: 'Replied.', artifacts: [] }, exitCode: 0, args: {},
  };
}
const ev = (kind: TaskRecord['events'][number]['kind'], text: string | null, summary = text ?? ''): TaskRecord['events'][number] =>
  ({ task_id: 't', kind, summary, tool: null, target: null, is_error: null, text });

describe('intake', () => {
  it('requires date and time for a prep plan and turns the answers into a message', () => {
    expect(intakeComplete('interview-plan', { date: '2026-09-10' })).toBe(false);
    expect(intakeComplete('interview-plan', { date: '2026-09-10', time: '14:00' })).toBe(true);
    expect(intakeMessage('interview-plan', { date: '2026-09-10', time: '14:00', interviewers: '', notes: 'phone' }))
      .toBe('- Interview date: 2026-09-10\n- Start time: 14:00\n- Anything else: phone');
  });

  it('requires a debrief text and a round type for practice', () => {
    expect(intakeComplete('interview-debrief', {})).toBe(false);
    expect(intakeComplete('interview-debrief', { debrief: 'They asked about SQL.' })).toBe(true);
    expect(intakeComplete('interview-practice', { round: 'Final round' })).toBe(true);
  });
});

describe('prompt context', () => {
  it('sends the intake details on the first turn with the chat rules', () => {
    const ctx = buildContext([], '- Interview date: 2026-09-10');
    expect(ctx.startsWith('\n\nDetails provided by the candidate:\n- Interview date: 2026-09-10')).toBe(true);
    expect(ctx).toMatch(/do not stop to ask/);
    expect(ctx).not.toMatch(/Transcript so far/);
  });

  it('quotes the exchange so far and the new message on later turns', () => {
    const turns: Turn[] = [{ user: '- Date: x', taskId: 't1', reply: 'Plan written. Which round?' }];
    const ctx = buildContext(turns, 'Hiring manager.');
    expect(ctx).toMatch(/Transcript so far:\n\nCandidate:\n- Date: x\n\nYou:\nPlan written\. Which round\?/);
    expect(ctx).toMatch(/The candidate now says:\nHiring manager\./);
    expect(ctx).toMatch(/Do not repeat the whole plan/);
  });

  it('caps a quoted reply so the prompt stays bounded and marks a lost reply', () => {
    const long = 'y'.repeat(7000);
    const ctx = buildContext([{ user: 'a', taskId: 't1', reply: long }, { user: 'b', taskId: 't2', reply: null }], 'c');
    expect(ctx).toContain('y'.repeat(6000) + '…');
    expect(ctx).not.toContain('y'.repeat(6001));
    expect(ctx).toContain('(reply not captured)');
  });
});

describe('reply capture', () => {
  it('prefers the final result text over intermediate text blocks', () => {
    const t = task([ev('text', 'Reading cv.md first.'), ev('tool', null, 'Read'), ev('result', 'Here is your plan.')]);
    expect(replyFromTask(t)).toBe('Here is your plan.');
  });

  it('falls back to the last text block when the provider emits no result (codex)', () => {
    const t = task([ev('text', 'Working…'), ev('text', 'All done, plan written.')]);
    expect(replyFromTask(t)).toBe('All done, plan written.');
  });

  it('returns null with no usable text', () => {
    expect(replyFromTask(task([ev('result', '')]))).toBeNull();
    expect(replyFromTask(null)).toBeNull();
  });
});

describe('sessions', () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } } });
  });
  afterEach(() => { vi.unstubAllGlobals(); for (const k of Object.keys(store)) delete store[k]; });

  it('keys a session by mode, company and role, case-insensitively', () => {
    expect(sessionKey('interview-plan', ' Acme ', 'PM')).toBe('interview-plan|acme|pm');
  });

  it('round-trips sessions per workspace and finds them by key or task', () => {
    const s: Session = { key: sessionKey('interview-plan', 'Acme', 'PM'), mode: 'interview-plan', company: 'Acme', role: 'PM', turns: [{ user: 'a', taskId: 't1', reply: null }] };
    saveSessions('/w', upsertSession([], s));
    const loaded = loadSessions('/w');
    expect(findSession(loaded, s.key)?.company).toBe('Acme');
    expect(findSessionByTask(loaded, 't1')?.key).toBe(s.key);
    expect(findSessionByTask(loaded, 'nope')).toBeNull();
    expect(loadSessions('/other')).toEqual([]);
  });

  it('upsert replaces the session with the same key and keeps others', () => {
    const a: Session = { key: 'k1', mode: 'interview-plan', company: 'A', role: 'x', turns: [] };
    const b: Session = { key: 'k2', mode: 'interview-plan', company: 'B', role: 'y', turns: [] };
    const a2 = { ...a, turns: [{ user: 'u', taskId: 't', reply: null }] };
    const out = upsertSession(upsertSession([a], b), a2);
    expect(out.map((s) => s.key)).toEqual(['k1', 'k2']);
    expect(out[0].turns).toHaveLength(1);
  });

  it('survives garbage and blocked storage', () => {
    store['careerops.interviewSessions./w'] = '{not json';
    expect(loadSessions('/w')).toEqual([]);
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } });
    expect(loadSessions('/w')).toEqual([]);
    expect(() => saveSessions('/w', [])).not.toThrow();
  });
});
