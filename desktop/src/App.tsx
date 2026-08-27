import { useCallback, useEffect, useState } from 'react';
import { doctor, isError, listApplications, type Application, type DoctorResult, type ListResult } from './api';
import { loadRoot, pickRoot } from './config';
import { loadContracts } from './lib/contracts';
import { initialState, startPolling, stopPolling, downloadAndInstall, type UpdateState } from './lib/updater';
import Header from './components/Header';
import UpdateModal from './components/UpdateModal';
import {
  HomeIcon, PipelineIcon, ProgressIcon, InterviewIcon,
  ProfileIcon, HelpIcon,
} from './components/icons';
import EmptyState from './screens/EmptyState';
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

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [probe, setProbe] = useState<DoctorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ListResult | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [onboarded, setOnboarded] = useState(true);
  const [evalUrl, setEvalUrl] = useState<string | undefined>();
  const [pipelineSelected, setPipelineSelected] = useState<string | undefined>();
  const [iwMode, setIwMode] = useState<'interview-plan' | 'interview-practice' | 'interview-debrief'>('interview-plan');
  const [iwCompany, setIwCompany] = useState('');
  const [iwRole, setIwRole] = useState('');
  const [updateState, setUpdateState] = useState<UpdateState>(initialState);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const refresh = useCallback(async (path: string) => {
    setError(null);
    try {
      const r = await doctor(path);
      if (isError(r)) { setError(r.message); return; }
      setProbe(r);
      if (r.missing.length > 0) setOnboarded(false);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadContracts().catch(() => {});
    loadRoot()
      .then((p) => {
        setRoot(p);
        if (p) refresh(p);
      })
      .catch((e) => setError(String(e)));

    const appVersion = __APP_VERSION__;
    setUpdateState((s) => ({ ...s, currentVersion: appVersion }));
    startPolling(setUpdateState, appVersion);
    return () => stopPolling();
  }, [refresh]);

  const onPick = useCallback(async () => {
    const picked = await pickRoot();
    if (!picked) return;
    setRoot(picked);
    await refresh(picked);
  }, [refresh]);

  const reload = useCallback(async () => {
    if (!root) return;
    const r = await listApplications(root);
    if (isError(r)) { setError(r.message); return; }
    setData(r);
  }, [root]);

  useEffect(() => { if (probe?.ready) reload(); }, [probe, reload]);

  const navigate = useCallback((target: string, params?: Record<string, string>) => {
    if (target === 'evaluate') {
      setEvalUrl(params?.url);
      setScreen('evaluate');
    } else if (target === 'pipeline') {
      setPipelineSelected(params?.selected);
      setScreen('pipeline');
    } else if (target === 'scanner') {
      setScreen('scanner');
    } else {
      setScreen(target as Screen);
    }
  }, []);

  const startInterviewWorkflow = useCallback(
    (mode: string, app: Application) => {
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

  if (!root || !probe) {
    return <EmptyState root={root} missing={probe?.missing ?? []} onPick={onPick} />;
  }

  if (!onboarded) {
    return <Onboarding root={root} onComplete={() => { setOnboarded(true); reload(); }} />;
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
    { key: 'profile', label: 'Profile', Icon: ProfileIcon },
    { key: 'help', label: 'Help', Icon: HelpIcon },
  ];

  function renderScreen() {
    switch (screen) {
      case 'home':
        return <Home root={root!} data={data!} onNavigate={navigate} />;
      case 'pipeline':
        return <Pipeline root={root!} data={data!} onReload={reload} initialSelected={pipelineSelected} />;
      case 'progress':
        return <Progress data={data!.progress} />;
      case 'evaluate':
        return <Evaluate root={root!} initialUrl={evalUrl} onDone={() => { reload(); setScreen('pipeline'); }} />;
      case 'scanner':
        return <Scanner root={root!} onDone={() => { reload(); setScreen('pipeline'); }} />;
      case 'interview':
        return <Interview data={data!} onAction={startInterviewWorkflow} />;
      case 'interview-workflow':
        return <InterviewWorkflow root={root!} mode={iwMode} company={iwCompany} role={iwRole} onBack={() => setScreen('interview')} />;
      case 'profile':
        return <ProfileSettings root={root!} />;
      case 'help':
        return <Help root={root!} />;
    }
  }

  return (
    <div className="shell">
      <Header
        title={NAV.find((n) => n.key === screen)?.label ?? screen}
        root={root}
        onReload={reload}
        onChangeFolder={onPick}
        updateState={updateState}
        onUpdateClick={() => setShowUpdateModal(true)}
      />
      <nav className="nav">
        {NAV.map(({ key, label, Icon }) => (
          <button key={key} aria-current={screen === key} onClick={() => navigate(key)}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
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
