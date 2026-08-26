import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fail, pass, ROOT } from './helpers.mjs';

console.log('\nSkill project-root resolution (#3332)');

const entrypoints = [
  '.agents',
  '.antigravitycli',
  '.claude',
  '.cursor',
  '.grok',
  '.kimi',
  '.opencode',
  '.qwen',
].map(dir => join(dir, 'skills', 'career-ops', 'SKILL.md'));

const CANONICAL_SKILL = join(ROOT, '.agents', 'skills', 'career-ops', 'SKILL.md');
const CANONICAL_POINTER = '../../../.agents/skills/career-ops/SKILL.md';

// Git materializes a tracked symlink as its pointer text when core.symlinks is
// disabled (common on Windows and some mounted workspaces). The shipped
// bootstrap resolves exactly this form to the canonical skill, so this check
// must verify the effective content rather than treating that supported checkout
// representation as a missing routing rule.
function effectiveSkillText(skillPath) {
  const text = readFileSync(skillPath, 'utf8');
  return text.trim() === CANONICAL_POINTER ? readFileSync(CANONICAL_SKILL, 'utf8') : text;
}

function findProjectRoot(skillPath) {
  let current = dirname(skillPath);
  while (true) {
    if (existsSync(join(current, 'AGENTS.md')) && existsSync(join(current, 'modes'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

const failures = [];
for (const relativePath of entrypoints) {
  const skillPath = join(ROOT, relativePath);
  const text = effectiveSkillText(skillPath);
  const resolvedRoot = findProjectRoot(skillPath);

  if (resolve(resolvedRoot || '') !== resolve(ROOT)) {
    failures.push(`${relativePath}: resolved ${resolvedRoot || '(none)'}`);
  }
  if (!text.includes('Resolve every path in this router') ||
      !text.includes("never against the process's current working directory")) {
    failures.push(`${relativePath}: missing cwd-independent routing rule`);
  }
}

if (failures.length === 0) {
  pass('all CLI skill entrypoints resolve modes/ from the checkout root, not cwd');
} else {
  fail(failures.join(' | '));
}
