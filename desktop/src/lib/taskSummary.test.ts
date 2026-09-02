import { describe, expect, it } from 'vitest';
import { summarize } from './taskSummary';

const ev = (tool: string, target: string | null) => ({ task_id: 't', kind: 'tool' as const, summary: tool, tool, target, is_error: null });

describe('summarize', () => {
  it('turns tool calls into plain language', () => {
    expect(summarize(ev('WebFetch', 'https://www.stepstone.de/jobs/123'))).toBe('Reading www.stepstone.de');
    expect(summarize(ev('Read', '/w/documents/cv/cv.md'))).toBe('Reading cv.md');
    expect(summarize(ev('Write', '/Users/x/CareerOps/reports/042-acme.md'))).toBe('Writing reports/042-acme.md');
    expect(summarize(ev('Bash', 'node merge-tracker.mjs'))).toBe('Updating tracker');
    expect(summarize(ev('Bash', 'node generate-pdf.mjs out.html out.pdf'))).toBe('Generating PDF');
    expect(summarize(ev('Bash', 'ls -la'))).toBe('Running ls');
    expect(summarize(ev('Task', 'Evaluate the posting end to end'))).toBe('Delegating: Evaluate the posting end to end');
    expect(summarize(ev('mcp__playwright__browser_navigate', null))).toBe('browser_navigate');
  });
  it('passes status and text through', () => {
    expect(summarize({ task_id: 't', kind: 'status', summary: 'Reading sample.txt', tool: null, target: null, is_error: null })).toBe('Reading sample.txt');
  });
});
