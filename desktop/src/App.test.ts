import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const mocks = vi.hoisted(() => ({
  doctor: vi.fn(),
  listApplications: vi.fn(),
  prepareOnboardingWorkspace: vi.fn(),
}));

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
vi.mock('./api', () => ({
  doctor: mocks.doctor,
  isError: (value: { ok: boolean }) => !value.ok,
  listApplications: mocks.listApplications,
  prepareOnboardingWorkspace: mocks.prepareOnboardingWorkspace,
}));

afterEach(() => {
  hooks.reset([]);
  vi.resetAllMocks();
});

type ElementNode = {
  type?: unknown;
  props?: { onComplete?: () => void | Promise<void> };
};

const data = {
  applications: [],
  metrics: { Total: 0, ByStatus: {}, AvgScore: 0, TopScore: 0, WithPDF: 0, Actionable: 0 },
  progress: {
    FunnelStages: [], ScoreBuckets: [], WeeklyActivity: [], ResponseRate: 0, InterviewRate: 0,
    OfferRate: 0, AvgScore: 0, TopScore: 0, TotalOffers: 0, ActiveApps: 0,
  },
};

function render(probe: { missing: string[]; ready: boolean }, onboarded = probe.missing.length === 0) {
  hooks.reset([
    '/workspace', true, { ok: true, careerOpsPath: '/workspace', trackerPath: null, ...probe },
    null, null, null, 'home', onboarded, undefined, undefined,
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

  it('shows onboarding when an existing tracker lacks a profile prerequisite', () => {
    const tree = render({ missing: ['config/profile.yml'], ready: true }, false);

    expect((tree.type as { name?: string })?.name).toBe('Onboarding');
  });

  it('refreshes from the Ready callback before entering the app', async () => {
    mocks.prepareOnboardingWorkspace.mockResolvedValue(undefined);
    mocks.doctor.mockResolvedValue({
      ok: true,
      careerOpsPath: '/workspace',
      trackerPath: '/workspace/data/applications.md',
      missing: [],
      ready: true,
    });
    mocks.listApplications.mockResolvedValue({ ok: true, ...data });
    const initial = render({ missing: ['cv.md', 'config/profile.yml'], ready: true }, false);

    expect((initial.type as { name?: string })?.name).toBe('Onboarding');
    await initial.props?.onComplete?.();

    expect(mocks.prepareOnboardingWorkspace).toHaveBeenCalledWith('/workspace');
    expect(mocks.doctor).toHaveBeenCalledWith('/workspace');

    const completed = (() => {
      hooks.beginRender();
      return App() as ElementNode;
    })();
    expect(completed.type).toBe('div');
  });

  it('does not enter the shell or reload when the fresh doctor call fails', async () => {
    mocks.prepareOnboardingWorkspace.mockResolvedValue(undefined);
    mocks.doctor.mockResolvedValue({
      ok: false,
      error: 'doctor-failed',
      message: 'Fresh workspace validation failed.',
    });
    const initial = render({ missing: ['cv.md'], ready: true }, false);

    await initial.props?.onComplete?.();

    expect(mocks.listApplications).not.toHaveBeenCalled();
    hooks.beginRender();
    expect((App() as ElementNode).type).toBe('main');
  });
});
