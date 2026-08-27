// tests/readme-hitl-markers.test.mjs — the fork's two README files (English and
// zh-TW) must carry the HITL guarantee marker, inside the table row it anchors.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nREADME HITL markers — the guarantee row keeps its anchor');

const MARKER = '<!-- hitl: absolute guarantee.';
const readmes = ['README.md'];
if (existsSync(join(ROOT, 'README.zh-TW.md'))) readmes.push('README.zh-TW.md');

if (readmes.length >= 2) pass(`found ${readmes.length} README files (2 expected: en + zh-TW)`);
else fail(`only ${readmes.length} README file(s) found — README.zh-TW.md missing`);

for (const file of readmes) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  const count = content.split(MARKER).length - 1;
  if (count !== 1) {
    fail(`${file}: expected exactly 1 HITL marker, found ${count}`);
    continue;
  }
  const line = content.split('\n').find((l) => l.includes(MARKER)) ?? '';
  if (!line.trimStart().startsWith('|') || (line.match(/\|/g) || []).length < 2) {
    fail(`${file}: HITL marker sits outside a table row (own line splits the table)`);
  } else {
    pass(`${file}: marker present, inside its table row`);
  }

  if (file === 'README.md') {
    const mStart = line.indexOf(MARKER);
    const mEnd = line.indexOf('-->', mStart);
    const prose = mEnd === -1 ? null : line.slice(0, mStart) + line.slice(mEnd + '-->'.length);
    if (prose === null) {
      fail(`${file}: the HITL marker comment is never closed with -->`);
    } else if (/never submits an application/i.test(prose)) {
      pass(`${file}: the row states the prohibition in absolute terms`);
    } else {
      fail(`${file}: the HITL row no longer says "never submits an application"`);
    }
    const HEDGES = /\b(usually|generally|normally|typically|by default|unless|without your permission|automatically|by itself)\b/i;
    const hedge = prose === null ? null : prose.match(HEDGES);
    if (prose === null) {
      // Already reported above
    } else if (hedge) {
      fail(`${file}: the HITL row hedges with "${hedge[0]}" -- the guarantee is absolute, not a default`);
    } else {
      pass(`${file}: no hedge in the guarantee row`);
    }
  }
}
