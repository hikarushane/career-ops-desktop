import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  applyGeneration, getGenerationResult, languageSettings, prepareOnboardingWorkspace,
  resolveJobLanguage, setAnalysisLanguage, stageIntakeFiles,
} from './api';

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

  it('forwards categorized intake files to the Rust staging command', async () => {
    mockedInvoke.mockResolvedValueOnce([{
      sourcePath: '/source/resume.pdf',
      destinationPath: '/workspace/documents/cv/resume.pdf',
      category: 'cv',
      duplicate: false,
    }]);

    await expect(stageIntakeFiles('/workspace', [{
      sourcePath: '/source/resume.pdf',
      category: 'cv',
    }])).resolves.toHaveLength(1);
    expect(mockedInvoke).toHaveBeenCalledWith('stage_intake_files_for_workspace', {
      root: '/workspace',
      files: [{ sourcePath: '/source/resume.pdf', category: 'cv' }],
    });
  });

  it('forwards explicit onboarding completion to the Rust scaffolder', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);

    await expect(prepareOnboardingWorkspace('/workspace')).resolves.toBeUndefined();
    expect(mockedInvoke).toHaveBeenCalledWith('prepare_onboarding_workspace', {
      root: '/workspace',
    });
  });

  it('fetches the generation result by task id', async () => {
    mockedInvoke.mockResolvedValueOnce({
      taskId: 'task-1',
      files: [{ path: 'cv.md', content: '# CV\n', valid: true, issue: null }],
      complete: false,
    });

    await expect(getGenerationResult('task-1')).resolves.toMatchObject({ taskId: 'task-1' });
    expect(mockedInvoke).toHaveBeenCalledWith('generation_result', { taskId: 'task-1' });
  });

  it('applies generation and returns the written paths', async () => {
    mockedInvoke.mockResolvedValueOnce(['cv.md', 'config/profile.yml']);

    await expect(applyGeneration('task-1')).resolves.toEqual(['cv.md', 'config/profile.yml']);
    expect(mockedInvoke).toHaveBeenCalledWith('apply_generation', { taskId: 'task-1' });
  });

  it('forwards analysis-language writes to the no-follow Rust command', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);

    await expect(setAnalysisLanguage('fixture-root', 'fr')).resolves.toBeUndefined();
    expect(mockedInvoke).toHaveBeenCalledWith('set_analysis_language', {
      path: 'fixture-root',
      language: 'fr',
    });
  });
});
