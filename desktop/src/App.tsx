import { useCallback, useEffect, useState } from 'react';
import {
  doctor, isError, listApplications, prepareOnboardingWorkspace,
  type Application, type DoctorResult, type ListResult,
} from './api';
import { loadActiveRoot, pickWorkspace, saveRoot } from './config';
import { loadContracts } from './lib/contracts';
import { dismiss, initTaskStore, startTask, useRunningTasks, useTasks } from './lib/taskStore';
import { initialState, startPolling, stopPolling, downloadAndInstall, type UpdateState } from './lib/updater';
import Header from './components/Header';
import UpdateModal from './components/UpdateModal';
import {
  HomeIcon, PipelineIcon, ProgressIcon, InterviewIcon,
  SettingsIcon, HelpIcon,
} from './components/icons';
import EmptyState from './screens/EmptyState';
import WorkspaceSetup from './screens/WorkspaceSetup';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';
import Pipeline from './screens/Pipeline';
import Progress from './screens/Progress';
import Evaluate from './screens/Evaluate';
import Scanner from './screens/Scanner';
import Interview from './screens/Interview';
import InterviewWorkflow from './screens/InterviewWorkflow';
import ProfileSettings from './screens/ProfileSettings';
import Help from './screens/Help';

type Screen =
  | 'home' | 'pipeline' | 'progress' | 'evaluate'
  | 'scanner' | 'interview' | 'interview-workflow'
  | 'profile' | 'help';

// Guards a batch start against a double click. Deliberately module-level
// rather than component state: App must not gain a useState slot for this,
// and a plain synchronous flag closes the double-click race window
// immediately, before the first click's handler even returns — a
// useRunningTasks()-derived boolean cannot, because the task is not
// registered in the store until after startTask's await resolves.
let batchStartInFlight = false;

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [rootLoaded, setRootLoaded] = useState(false);
  const [probe, setProbe] = useState<DoctorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [data, setData] = useState<ListResult | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [onboarded, setOnboarded] = useState(true);
  const [evalUrl, setEvalUrl] = useState<string | undefined>();
  const [pipelineSelected, setPipelineSelected] = useState<string | undefined>();
  const [iwMode, setIwMode] = useState<'interview-plan' | 'interview-practice' | 'interview-debrief'>('interview-plan');
  const [iwCompany, setIwCompany] = useState('');
  const [iwRole, setIwRole] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>(initialState);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const tasks = useTasks();
  const runningTasks = useRunningTasks();
  const batchRunning = runningTasks.some((t) => t.taskType === 'batch');

  const refresh = useCallback(async (path: string) => {
    setError(null);
    try {
      const r = await doctor(path);
      if (isError(r)) { setError(r.message); return; }
      setProbe(r);
      setOnboarded(r.missing.length === 0);
      return r;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, []);

  const reload = useCallback(async (path = root) => {
    if (!path) return;
    const r = await listApplications(path);
    if (isError(r)) { setError(r.message); return; }
    setData(r);
  }, [root]);

  useEffect(() => {
    loadContracts().catch(() => {});
    void initTaskStore();
    loadActiveRoot()
      .then(async (p) => {
        setRoot(p);
        if (!p) return;
        const workspace = await refresh(p);
        if (workspace?.ready) await reload(p);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setRootLoaded(true));

    const appVersion = __APP_VERSION__;
    setUpdateState((s) => ({ ...s, currentVersion: appVersion }));
    startPolling(setUpdateState, appVersion);
    return () => stopPolling();
  }, [refresh]);

  const onWorkspaceReady = useCallback(async (path: string) => {
    await saveRoot(path);
    setRoot(path);
    setData(null);
    setProbe(null);
    const workspace = await refresh(path);
    if (workspace?.ready) await reload(path);
  }, [refresh, reload]);

  const onPick = useCallback(async () => {
    setWorkspaceError(null);
    try {
      const picked = await pickWorkspace();
      if (picked) await onWorkspaceReady(picked);
    } catch (reason) {
      setWorkspaceError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [onWorkspaceReady]);

  const completeOnboarding = useCallback(async () => {
    if (!root) return;
    try {
      await prepareOnboardingWorkspace(root);
      const workspace = await refresh(root);
      if (workspace?.ready && workspace.missing.length === 0) await reload(root);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [refresh, reload, root]);

  const navigate = useCallback((target: string, params?: Record<string, string>) => {
    if (target === 'evaluate') {
      setEvalUrl(params?.url);
      setActiveTaskId(params?.taskId ?? null);
      setScreen('evaluate');
    } else if (target === 'pipeline') {
      setPipelineSelected(params?.selected);
      setScreen('pipeline');
    } else if (target === 'scanner') {
      // A fresh visit to the scanner (not a reopen from the header chip)
      // must not inherit a stale activeTaskId left over from a previous
      // evaluate/batch/interview session — Scanner would otherwise try to
      // hydrate a task of the wrong type.
      setActiveTaskId(null);
      setScreen('scanner');
    } else if (target === 'batch') {
      // Guard against a double click starting two batch agents over the
      // same data/pipeline.md (a report-numbering race): bail out
      // synchronously if a start is already in flight. There is no
      // dedicated error slot for a batch-start failure either; the
      // header's workspaceError banner is the only global error surface, so
      // it is reused here too.
      if (batchStartInFlight) return;
      batchStartInFlight = true;
      void (async () => {
        try {
          const id = await startTask('batch', {}, root!, `Batch (${data!.pipelineSummary.pending} pending)`);
          setEvalUrl(undefined);
          setActiveTaskId(id);
          setScreen('evaluate');
        } catch (e) {
          setWorkspaceError(e instanceof Error ? e.message : String(e));
        } finally {
          batchStartInFlight = false;
        }
      })();
    } else {
      setScreen(target as Screen);
    }
  }, [root, data]);

  const evalDone = useCallback(() => {
    reload();
    setScreen('pipeline');
  }, [reload]);

  const onOpenTask = useCallback((id: string) => {
    const task = tasks.find((t) => t.taskId === id);
    if (!task) return;
    if (task.taskType === 'evaluate' || task.taskType === 'batch') {
      navigate('evaluate', { taskId: id });
    } else if (task.taskType === 'scan') {
      setActiveTaskId(id);
      setScreen('scanner');
    } else if (task.taskType.startsWith('interview')) {
      setActiveTaskId(id);
      setIwMode(task.taskType as typeof iwMode);
      setScreen('interview-workflow');
    }
  }, [tasks, navigate]);

  const startInterviewWorkflow = useCallback(
    (mode: string, app: Application) => {
      // A fresh start (not a reopen from the header chip) must not inherit
      // a stale activeTaskId from a previous session — see the 'scanner'
      // branch of navigate() above for the same concern.
      setActiveTaskId(null);
      setIwMode(mode as typeof iwMode);
      setIwCompany(app.company);
      setIwRole(app.role);
      setScreen('interview-workflow');
    },
    [],
  );

  if (error) {
    return (
      <main className="state-screen">
        <h1 className="state-title">Cannot reach the sidecar</h1>
        <pre className="state-error">{error}</pre>
      </main>
    );
  }

  if (!rootLoaded) {
    return <main className="state-screen"><p className="state-loading">Loading…</p></main>;
  }

  if (!root) {
    return <WorkspaceSetup onReady={onWorkspaceReady} />;
  }

  if (!probe) {
    return <main className="state-screen"><p className="state-loading">Loading…</p></main>;
  }

  if (!onboarded) {
    return <Onboarding root={root} onComplete={completeOnboarding} />;
  }

  if (!probe.ready) {
    return <EmptyState root={root} missing={probe.missing} onPick={onPick} />;
  }

  if (!data) return <main className="state-screen"><p className="state-loading">Loading…</p></main>;

  const NAV: { key: Screen; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
    { key: 'home', label: 'Home', Icon: HomeIcon },
    { key: 'pipeline', label: 'Jobs', Icon: PipelineIcon },
    { key: 'interview', label: 'Interview', Icon: InterviewIcon },
    { key: 'progress', label: 'Progress', Icon: ProgressIcon },
    { key: 'profile', label: 'Settings', Icon: SettingsIcon },
    { key: 'help', label: 'Help', Icon: HelpIcon },
  ];

  function renderScreen() {
    switch (screen) {
      case 'home':
        return <Home root={root!} data={data!} onNavigate={navigate} batchStarting={batchRunning || batchStartInFlight} />;
      case 'pipeline':
        return <Pipeline root={root!} data={data!} onReload={reload} initialSelected={pipelineSelected} />;
      case 'progress':
        return <Progress data={data!.progress} />;
      case 'evaluate':
        return <Evaluate key={activeTaskId ?? 'new'} root={root!} initialUrl={evalUrl} initialTaskId={activeTaskId} onDone={evalDone} />;
      case 'scanner':
        return (
          <Scanner
            key={activeTaskId ?? 'new'}
            root={root!}
            initialTaskId={activeTaskId}
            onDone={() => { reload(); setScreen('pipeline'); }}
          />
        );
      case 'interview':
        return <Interview data={data!} onAction={startInterviewWorkflow} />;
      case 'interview-workflow':
        return (
          <InterviewWorkflow
            key={activeTaskId ?? 'new'}
            root={root!}
            mode={iwMode}
            company={iwCompany}
            role={iwRole}
            initialTaskId={activeTaskId}
            onBack={() => setScreen('interview')}
          />
        );
      case 'profile':
        return <ProfileSettings root={root!} onWorkspaceChanged={onWorkspaceReady} />;
      case 'help':
        return <Help root={root!} />;
    }
  }

  return (
    <div className="shell">
      <Header
        title={NAV.find((n) => n.key === screen || (n.key === 'pipeline' && screen === 'evaluate'))?.label ?? screen}
        root={root}
        onReload={reload}
        onChangeFolder={onPick}
        updateState={updateState}
        onUpdateClick={() => setShowUpdateModal(true)}
        tasks={tasks}
        onOpenTask={onOpenTask}
        onDismissTask={dismiss}
      />
      <nav className="nav">
        {NAV.map(({ key, label, Icon }) => (
          <button key={key} aria-current={screen === key || (key === 'pipeline' && screen === 'evaluate')} onClick={() => navigate(key)}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {workspaceError && (
        <div className="banner workspace-chooser-alert" role="alert">
          <p>{workspaceError}</p>
          <button type="button" onClick={() => setWorkspaceError(null)}>Dismiss</button>
        </div>
      )}
      {renderScreen()}
      {showUpdateModal && (
        <UpdateModal
          state={updateState}
          onUpdate={() => downloadAndInstall(setUpdateState, updateState.currentVersion)}
          onClose={() => setShowUpdateModal(false)}
        />
      )}
    </div>
  );
}
