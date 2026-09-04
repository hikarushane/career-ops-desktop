import { useState } from 'react';
import AiSetup from './AiSetup';
import BackgroundImport, { type BackgroundImportResult } from './BackgroundImport';
import JobPreferences from './JobPreferences';
import ProfileGeneration from './ProfileGeneration';
import AnalysisLanguageField from '../components/AnalysisLanguageField';
import { EMPTY_PREFERENCES, savePreferences, type JobPreferences as Preferences } from '../lib/jobPreferences';
import { UI_LANGUAGES, getUiLanguage, t, type UiLanguage } from '../lib/i18n';
import type { StagedIntakeFile } from '../api';

type Props = {
  root: string;
  onComplete: () => void;
  /** Lets the language step switch the interface language as well (App re-renders). */
  onUiLanguageChange?: (language: UiLanguage) => void;
};

type Step = 'welcome' | 'import' | 'language' | 'ai' | 'preferences' | 'generating' | 'ready';

export default function Onboarding({ root, onComplete, onUiLanguageChange }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [staged, setStaged] = useState<StagedIntakeFile[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFERENCES);

  const completeBackgroundImport = (result: BackgroundImportResult) => {
    setStaged(result.staged);
    setStep('language');
  };

  const prevMap: Partial<Record<Step, Step>> = {
    import: 'welcome',
    language: 'import',
    ai: 'language',
    preferences: 'ai',
    generating: 'preferences',
    ready: 'preferences',
  };

  let content: React.ReactNode;

  if (step === 'welcome') {
    content = (
      <div className="setup-screen">
        <h1>{t('Welcome to CareerOps')}</h1>
        <p className="setup-subtitle">
          {t("Your AI-powered job search assistant. Let's set up your profile.")}
        </p>
        <button className="btn-primary" onClick={() => setStep('import')}>{t('Get Started')}</button>
      </div>
    );
  } else if (step === 'import') {
    content = <BackgroundImport root={root} initialStaged={staged} onComplete={completeBackgroundImport} />;
  } else if (step === 'language') {
    content = (
      <div className="setup-screen">
        <section className="ui-language-field">
          <h2>{t('App language')}</h2>
          <div className="ai-segment" role="radiogroup" aria-label={t('App language')}>
            {UI_LANGUAGES.map((option) => (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={getUiLanguage() === option.code}
                onClick={() => onUiLanguageChange?.(option.code)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
        <AnalysisLanguageField root={root} onSaved={() => setStep('ai')} />
      </div>
    );
  } else if (step === 'ai') {
    content = <AiSetup onComplete={() => setStep('preferences')} />;
  } else if (step === 'preferences') {
    content = (
      <JobPreferences
        value={preferences}
        onChange={setPreferences}
        onContinue={() => {
          // Remembered so Settings > Job Search reopens on these answers.
          void savePreferences(root, preferences);
          setStep(staged.length > 0 ? 'generating' : 'ready');
        }}
      />
    );
  } else if (step === 'generating') {
    content = (
      <ProfileGeneration
        root={root}
        preferences={preferences}
        onComplete={() => setStep('ready')}
        onSkip={() => setStep('ready')}
      />
    );
  } else {
    content = (
      <div className="setup-screen">
        <h1>{t("You're all set")}</h1>
        <p className="setup-subtitle">
          {t('Paste a job URL to evaluate it, or scan for new opportunities.')}
        </p>
        <button className="btn-primary" onClick={onComplete}>{t('Open CareerOps')}</button>
      </div>
    );
  }

  const prev = prevMap[step];

  return (
    <div className="onboarding">
      {prev && (
        <button
          className="btn-back"
          onClick={() => setStep(prev)}
          aria-label={t('Previous step')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
      {content}
    </div>
  );
}
