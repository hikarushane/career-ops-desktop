import { describe, it, expect } from 'vitest';
import { initialState, type UpdateState, type UpdateStatus } from './updater';

describe('updater', () => {
  it('initialState returns idle with empty version', () => {
    const s = initialState();
    expect(s.status).toBe('idle');
    expect(s.currentVersion).toBe('');
  });

  it('all status values are valid UpdateStatus', () => {
    const valid: UpdateStatus[] = [
      'idle', 'checking', 'up_to_date', 'available',
      'downloading', 'installing', 'error',
    ];
    expect(valid).toHaveLength(7);
  });

  it('UpdateState with available has required fields', () => {
    const s: UpdateState = {
      status: 'available',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
      releaseNotes: 'Bug fixes',
      releaseDate: '2026-08-27',
    };
    expect(s.availableVersion).toBe('0.2.0');
    expect(s.releaseNotes).toBe('Bug fixes');
  });

  it('UpdateState error has error field', () => {
    const s: UpdateState = {
      status: 'error',
      currentVersion: '0.1.0',
      error: 'Network unreachable',
    };
    expect(s.error).toBe('Network unreachable');
  });
});
