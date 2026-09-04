import type { TaskEvent } from '../api';
import { t } from './i18n';

function basename(p: string) { return p.split(/[\\/]/).filter(Boolean).pop() ?? p; }
function workspaceRelative(p: string) {
  const m = p.match(/(reports|jds|output|data|interview-prep|documents|modes|config)\/.*$/);
  return m ? m[0] : basename(p);
}
function host(url: string) { try { return new URL(url).host; } catch { return url; } }

export function summarize(event: TaskEvent): string {
  if (event.kind !== 'tool') return event.summary;
  const tool = event.tool ?? '';
  const target = event.target ?? '';
  const short = tool.startsWith('mcp__') ? tool.split('__').pop() ?? tool : tool;
  switch (short) {
    case 'WebFetch': case 'fetch': return target ? t('Reading {name}', { name: host(target) }) : t('Reading a web page');
    case 'Read': return target ? t('Reading {name}', { name: basename(target) }) : t('Reading a file');
    case 'Write': case 'Edit': case 'MultiEdit': return target ? t('Writing {name}', { name: workspaceRelative(target) }) : t('Writing a file');
    case 'Bash': {
      if (/merge-tracker\.mjs|set-status\.mjs/.test(target)) return t('Updating tracker');
      if (/generate-pdf\.mjs|generate-latex\.mjs/.test(target)) return t('Generating PDF');
      const first = target.trim().split(/\s+/)[0];
      return first ? t('Running {name}', { name: first }) : t('Running a command');
    }
    case 'Task': case 'Agent': return t('Delegating: {name}', { name: target.slice(0, 60) });
    case 'WebSearch': return t('Searching: {name}', { name: target.slice(0, 60) });
    default: return short;
  }
}
