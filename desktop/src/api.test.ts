import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { languageSettings, resolveJobLanguage } from './api';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

afterEach(() => {
  mockedInvoke.mockReset();
});

describe('sidecar JSON bridge', () => {
  it('decodes language settings forwarded as sidecar stdout', async () => {
    mockedInvoke.mockResolvedValueOnce('{"analysisLanguage":"en","options":[{"code":"en","name":"English"}]}');

    await expect(languageSettings('fixture-root')).resolves.toEqual({
      analysisLanguage: 'en',
      options: [{ code: 'en', name: 'English' }],
    });
    expect(mockedInvoke).toHaveBeenCalledWith('language_settings', { path: 'fixture-root' });
  });

  it('surfaces a language sidecar failure to the caller', async () => {
    mockedInvoke.mockResolvedValueOnce('{"ok":false,"error":"language-error","message":"profile unavailable"}');

    await expect(resolveJobLanguage('fixture-root', 'job text')).rejects.toThrow('profile unavailable');
  });

  it('rejects malformed sidecar stdout instead of treating it as data', async () => {
    mockedInvoke.mockResolvedValueOnce('not json');

    await expect(languageSettings('fixture-root')).rejects.toThrow('Sidecar returned invalid JSON');
  });
});
