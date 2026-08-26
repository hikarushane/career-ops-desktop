import { useState } from 'react';
import AiSetup from './AiSetup';
import BackgroundImport from './BackgroundImport';

type Props = { root: string; onComplete: () => void };

type Step = 'welcome' | 'import' | 'ai' | 'ready';

export default function Onboarding({ root, onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');

  if (step === 'welcome') {
    return (
      <div className="setup-screen">
        <h1>Welcome to CareerOps</h1>
        <p className="setup-subtitle">
          Your AI-powered job search assistant. Let's set up your profile.
        </p>
        <button className="btn-primary" onClick={() => setStep('import')}>Get Started</button>
        <button className="btn-ghost" onClick={() => setStep('ai')}>Skip, I'll add documents later</button>
      </div>
    );
  }

  if (step === 'import') {
    return <BackgroundImport root={root} onComplete={() => setStep('ai')} />;
  }

  if (step === 'ai') {
    return <AiSetup onComplete={() => setStep('ready')} />;
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
