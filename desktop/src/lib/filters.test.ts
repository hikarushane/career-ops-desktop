import { describe, expect, it } from 'vitest';
import type { Application } from '../api';
import { applyFilterAndSort, countForFilter, groupByStatus, matchesSearch, scoreBand } from './filters';

function app(over: Partial<Application>): Application {
  return {
    number: 0,
    date: '2026-07-01',
    company: 'X',
    role: 'Dev',
    status: 'Evaluated',
    normStatus: 'evaluated',
    statusPriority: 4,
    score: 3.0,
    scoreRaw: '3.0/5',
    hasPdf: false,
    pdfPath: '',
    reportPath: '',
    reportNumber: '',
    notes: '',
    jobUrl: '',
    archetype: '',
    tldr: '',
    remote: '',
    compEstimate: '',
    ...over,
  };
}

const FIXTURE: Application[] = [
  app({ number: 1, company: 'Anthropic', score: 4.8, status: 'Interview', normStatus: 'interview', statusPriority: 0, date: '2026-07-20' }),
  app({ number: 2, company: 'Retool', score: 4.4, status: 'Applied', normStatus: 'applied', statusPriority: 3, date: '2026-07-18' }),
  app({ number: 3, company: 'n8n', score: 4.1, status: 'Responded', normStatus: 'responded', statusPriority: 2, date: '2026-07-15' }),
  app({ number: 4, company: 'Tinybird', score: 3.9, status: 'Evaluated', normStatus: 'evaluated', statusPriority: 4, date: '2026-07-12' }),
  app({ number: 7, company: 'Clarity AI', score: 4.5, status: 'SKIP', normStatus: 'skip', statusPriority: 5, date: '2026-07-05' }),
  app({ number: 8, company: 'Travelperk', score: 4.2, status: 'Offer', normStatus: 'offer', statusPriority: 1, date: '2026-07-02' }),
  // Exactly 4.0. Without a row on the boundary, `>= 4.0` and `> 4.0` are
  // indistinguishable and a mutation to the comparison passes the suite —
  // verified by mutating filters.ts and watching all 14 tests still pass.
  app({ number: 9, company: 'Boundary', score: 4.0, status: 'Evaluated', normStatus: 'evaluated', statusPriority: 4, date: '2026-07-01' }),
];

describe('matchesSearch', () => {
  it('matches company, role and notes case-insensitively', () => {
    const a = app({ company: 'Anthropic', role: 'Applied AI Engineer', notes: 'Onsite loop' });
    expect(matchesSearch(a, 'anthro')).toBe(true);
    expect(matchesSearch(a, 'ENGINEER')).toBe(true);
    expect(matchesSearch(a, 'onsite')).toBe(true);
    expect(matchesSearch(a, 'nope')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesSearch(app({}), '')).toBe(true);
  });
});

describe('applyFilterAndSort', () => {
  it('filter "all" keeps every row', () => {
    expect(applyFilterAndSort(FIXTURE, 'all', 'score', 'flat', '')).toHaveLength(7);
  });

  it('filter "top" is score >= 4.0 excluding skip', () => {
    // Clarity AI scores 4.5 but is SKIP, so it is excluded — this mirrors
    // pipeline.go:546-549, where the label says "TOP >=4" and the code says
    // >= 4.0 && norm != "skip".
    const got = applyFilterAndSort(FIXTURE, 'top', 'score', 'flat', '');
    expect(got.map((a) => a.company)).toEqual(['Anthropic', 'Retool', 'Travelperk', 'n8n', 'Boundary']);
  });

  it('filter "top" includes a row scoring exactly 4.0', () => {
    // The boundary is the whole point of `>=`. Pin it separately so the rule
    // survives even if the ordering assertion above is ever loosened.
    const got = applyFilterAndSort(FIXTURE, 'top', 'score', 'flat', '');
    expect(got.map((a) => a.company)).toContain('Boundary');
  });

  it('filter "top" excludes a row scoring just under 4.0', () => {
    const got = applyFilterAndSort(FIXTURE, 'top', 'score', 'flat', '');
    expect(got.map((a) => a.company)).not.toContain('Tinybird');
  });

  it('a status filter matches the normalized status', () => {
    const got = applyFilterAndSort(FIXTURE, 'interview', 'score', 'flat', '');
    expect(got.map((a) => a.company)).toEqual(['Anthropic']);
  });

  it('sorts by score descending', () => {
    const got = applyFilterAndSort(FIXTURE, 'all', 'score', 'flat', '');
    expect(got.map((a) => a.score)).toEqual([4.8, 4.5, 4.4, 4.2, 4.1, 4.0, 3.9]);
  });

  it('sorts by date descending as a string comparison', () => {
    const got = applyFilterAndSort(FIXTURE, 'all', 'date', 'flat', '');
    expect(got[0].company).toBe('Anthropic');
    expect(got[got.length - 1].company).toBe('Boundary');
  });

  it('sorts by company case-insensitively ascending', () => {
    const got = applyFilterAndSort(FIXTURE, 'all', 'company', 'flat', '');
    expect(got.map((a) => a.company)).toEqual([
      'Anthropic', 'Boundary', 'Clarity AI', 'n8n', 'Retool', 'Tinybird', 'Travelperk',
    ]);
  });

  it('sorts by status priority ascending', () => {
    const got = applyFilterAndSort(FIXTURE, 'all', 'status', 'flat', '');
    expect(got.map((a) => a.statusPriority)).toEqual([0, 1, 2, 3, 4, 4, 5]);
  });

  it('grouped view orders by status priority first, then the chosen sort', () => {
    const got = applyFilterAndSort(FIXTURE, 'all', 'score', 'grouped', '');
    expect(got.map((a) => a.statusPriority)).toEqual([0, 1, 2, 3, 4, 4, 5]);
  });

  it('search narrows within the active tab', () => {
    const got = applyFilterAndSort(FIXTURE, 'top', 'score', 'flat', 'retool');
    expect(got.map((a) => a.company)).toEqual(['Retool']);
  });

  it('does not mutate its input', () => {
    const order = FIXTURE.map((a) => a.company);
    applyFilterAndSort(FIXTURE, 'all', 'company', 'grouped', '');
    expect(FIXTURE.map((a) => a.company)).toEqual(order);
  });
});

describe('groupByStatus', () => {
  it('omits empty groups so filtered status results are immediately visible', () => {
    const evaluated = applyFilterAndSort(FIXTURE, 'evaluated', 'score', 'grouped', '');

    expect(groupByStatus(evaluated).map((group) => [group.status, group.apps.length])).toEqual([
      ['evaluated', 2],
    ]);
  });
});

describe('countForFilter', () => {
  it('counts what the tab would show', () => {
    expect(countForFilter(FIXTURE, 'all', '')).toBe(7);
    expect(countForFilter(FIXTURE, 'top', '')).toBe(5);
    expect(countForFilter(FIXTURE, 'skip', '')).toBe(1);
  });
});

describe('scoreBand', () => {
  it('matches the TUI thresholds', () => {
    expect(scoreBand(4.2)).toBe('high');
    expect(scoreBand(4.19)).toBe('mid');
    expect(scoreBand(3.8)).toBe('mid');
    expect(scoreBand(3.79)).toBe('neutral');
    expect(scoreBand(3.0)).toBe('neutral');
    expect(scoreBand(2.99)).toBe('low');
  });
});
