import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '../../..');

describe('pre-push hook', () => {
  const hookPath = join(ROOT, '.githooks', 'pre-push');

  it('hook file exists', () => {
    expect(existsSync(hookPath)).toBe(true);
  });

  it('hook is a bash script', () => {
    const content = readFileSync(hookPath, 'utf8');
    expect(content.startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('hook checks version consistency', () => {
    const content = readFileSync(hookPath, 'utf8');
    expect(content).toContain('check_version_consistency');
  });

  it('hook checks release notes', () => {
    const content = readFileSync(hookPath, 'utf8');
    expect(content).toContain('check_release_notes');
  });

  it('hook checks release repo configuration', () => {
    const content = readFileSync(hookPath, 'utf8');
    expect(content).toContain('release.json');
  });

  it('hook gates main branch pushes', () => {
    const content = readFileSync(hookPath, 'utf8');
    expect(content).toContain('"main"');
  });

  it('hook gates release tag pushes', () => {
    const content = readFileSync(hookPath, 'utf8');
    expect(content).toContain('v*');
  });

  it('hook does not contain git commit', () => {
    const content = readFileSync(hookPath, 'utf8');
    expect(content).not.toContain('git commit');
  });

  it('hook does not contain git push', () => {
    const content = readFileSync(hookPath, 'utf8');
    expect(content).not.toContain('git push');
  });
});

describe('dev hooks setup', () => {
  it('setup script exists', () => {
    expect(existsSync(join(ROOT, 'scripts', 'setup-dev-hooks.mjs'))).toBe(true);
  });
});
