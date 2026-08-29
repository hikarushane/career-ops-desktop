import { useState } from 'react';
import AiSetup from './AiSetup';
import BackgroundImport, { type BackgroundImportResult } from './BackgroundImport';
import IntakeReview from './IntakeReview';
import AnalysisLanguageField from '../components/AnalysisLanguageField';
import type { StagedIntakeFile } from '../api';

type Props = { root: string; onComplete: () => void };

type Step = 'welcome' | 'import' | 'language' | 'ai' | 'intake' | 'ready';

export default function Onboarding({ root, onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [staged, setStaged] = useState<StagedIntakeFile[]>([]);

  const completeBackgroundImport = (result: BackgroundImportResult) => {
    setStaged(result.staged);
    setStep('language');
  };

  if (step === 'welcome') {
    return (
      <div className="setup-screen">
        <h1>Welcome to CareerOps</h1>
        <p className="setup-subtitle">
          Your AI-powered job search assistant. Let's set up your profile.
        </p>
        <button className="btn-primary" onClick={() => setStep('import')}>Get Started</button>
      </div>
    );
  }

  if (step === 'import') {
    return <BackgroundImport root={root} onComplete={completeBackgroundImport} />;
  }

  if (step === 'language') {
    return (
      <div className="setup-screen">
        <AnalysisLanguageField root={root} onSaved={() => setStep('ai')} />
      </div>
    );
  }

  if (step === 'ai') {
    return <AiSetup onComplete={() => setStep(staged.length > 0 ? 'intake' : 'ready')} />;
  }

  if (step === 'intake') {
    return <IntakeReview root={root} onBack={() => setStep('ai')} onComplete={() => setStep('ready')} />;
  }

  return (
    <div className="setup-screen">
      <h1>You're all set</h1>
      <p className="setup-subtitle">
        Paste a job URL to evaluate it, or scan for new opportunities.
      </p>
      <button className="btn-primary" onClick={onComplete}>Open CareerOps</button>
    </div>
  );
}
