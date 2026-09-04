import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_REPORT_WIDTH, MIN_OTHER_WIDTH, MIN_REPORT_WIDTH,
  clampReportWidth, loadReportWidth, reportWidthFromPointer, saveReportWidth,
} from './splitResize';

function fakeStorage(initial: Record<string, string> = {}, options: { throws?: boolean } = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => { if (options.throws) throw new Error('blocked'); return key in data ? data[key] : null; },
    setItem: (key: string, value: string) => { if (options.throws) throw new Error('blocked'); data[key] = value; },
    data,
  };
}

describe('report width', () => {
  it('keeps the report readable and leaves room for the other pane', () => {
    expect(clampReportWidth(100, 1366)).toBe(MIN_REPORT_WIDTH);
    expect(clampReportWidth(5000, 1366)).toBe(1366 - MIN_OTHER_WIDTH);
    expect(clampReportWidth(700, 1366)).toBe(700);
  });

  it('never clamps below the report minimum even on a narrow window', () => {
    expect(clampReportWidth(600, 500)).toBe(MIN_REPORT_WIDTH);
  });

  it('measures the width from the pointer to the container’s right edge', () => {
    expect(reportWidthFromPointer(1366, 700, 1366)).toBe(666);
    expect(reportWidthFromPointer(1366, 1300, 1366)).toBe(MIN_REPORT_WIDTH);
  });
});

describe('remembered width', () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => { storage = fakeStorage(); vi.stubGlobal('window', { localStorage: storage }); });
  afterEach(() => vi.unstubAllGlobals());

  it('falls back to the default when nothing is stored', () => {
    expect(loadReportWidth(1366)).toBe(DEFAULT_REPORT_WIDTH);
  });

  it('round-trips a saved width and clamps it to the current window', () => {
    saveReportWidth(720);
    expect(storage.data['careerops.reportWidth']).toBe('720');
    expect(loadReportWidth(1366)).toBe(720);
    expect(loadReportWidth(900)).toBe(900 - MIN_OTHER_WIDTH);
  });

  it('ignores garbage and survives blocked storage', () => {
    storage.data['careerops.reportWidth'] = 'wide';
    expect(loadReportWidth(1366)).toBe(DEFAULT_REPORT_WIDTH);
    vi.stubGlobal('window', { localStorage: fakeStorage({}, { throws: true }) });
    expect(loadReportWidth(1366)).toBe(DEFAULT_REPORT_WIDTH);
    expect(() => saveReportWidth(700)).not.toThrow();
  });
});
