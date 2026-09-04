import { describe, expect, it } from 'vitest';
import { stripHtmlPreamble } from './helpMarkdown';

const readme = `<p align="center">
  <img src="./docs/wordmark-light.svg" alt="CareerOps Desktop" width="250" />
</p>
<p align="center">
  <strong>AI-powered job search.</strong>
</p>
<p align="center">
  <a href="./README.md">繁體中文</a>
</p>

# CareerOps Desktop

A desktop app built on top of career-ops.<br>Second line.`;

describe('stripHtmlPreamble', () => {
  it('drops the HTML banner above the first heading and strips inline tags', () => {
    const out = stripHtmlPreamble(readme);
    expect(out.startsWith('# CareerOps Desktop')).toBe(true);
    expect(out).not.toContain('<');
    expect(out).toContain('A desktop app built on top of career-ops.Second line.');
  });

  it('keeps a Markdown preamble that is not HTML', () => {
    const md = 'Intro paragraph.\n\n# Title\n\nBody';
    expect(stripHtmlPreamble(md)).toBe(md);
  });

  it('leaves a document with no heading alone apart from tags', () => {
    expect(stripHtmlPreamble('<b>bold</b> text')).toBe('bold text');
  });
});
