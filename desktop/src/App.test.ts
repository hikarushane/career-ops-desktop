import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const hooks = vi.hoisted(() => {
  let state: unknown[] = [];
  let cursor = 0;
  return {
    reset(initial: unknown[]) {
      state = initial;
      cursor = 0;
    },
    beginRender() {
      cursor = 0;
    },
    useState(initial: unknown) {
      const index = cursor++;
      if (index === state.length) state.push(initial);
      return [state[index], (value: unknown) => { state[index] = value; }];
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: <T,>(callback: T) => callback,
    useEffect: () => {},
    useState: hooks.useState,
  };
});

afterEach(() => hooks.reset([]));

type ElementNode = { type?: unknown };

const data = {
  applications: [],
  metrics: { Total: 0, ByStatus: {}, AvgScore: 0, TopScore: 0, WithPDF: 0, Actionable: 0 },
  progress: {
    FunnelStages: [], ScoreBuckets: [], WeeklyActivity: [], ResponseRate: 0, InterviewRate: 0,
    OfferRate: 0, AvgScore: 0, TopScore: 0, TotalOffers: 0, ActiveApps: 0,
  },
};

function render(probe: { missing: string[]; ready: boolean }) {
  hooks.reset([
    '/workspace', true, { ok: true, careerOpsPath: '/workspace', trackerPath: null, ...probe },
    null, null, data, 'home', probe.missing.length === 0, undefined, undefined,
    'interview-plan', '', '', {}, false,
  ]);
  hooks.beginRender();
  return App() as ElementNode;
}

describe('workspace onboarding routing', () => {
  it('does not show onboarding for an existing workspace with prerequisites', () => {
    const tree = render({ missing: [], ready: true });

    expect((tree.type as { name?: string })?.name).not.toBe('Onboarding');
  });

  it('shows onboarding for an existing workspace missing profile prerequisites', () => {
    const tree = render({ missing: ['config/profile.yml'], ready: false });

    expect((tree.type as { name?: string })?.name).toBe('Onboarding');
  });
});
