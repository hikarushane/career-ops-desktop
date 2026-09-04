import type { JobPreferences as Preferences, Relocation } from '../lib/jobPreferences';
import { t } from '../lib/i18n';

type Props = {
  value: Preferences;
  onChange: (next: Preferences) => void;
  onContinue: () => void;
  /** Label of the submit button; onboarding's "Continue" by default. */
  continueLabel?: string;
  /** Inside Settings the tab already has a heading, so the form drops its own. */
  compact?: boolean;
};

const RELOCATION: { id: Relocation; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'no', label: 'No' },
];

export default function JobPreferences({ value, onChange, onContinue, continueLabel, compact = false }: Props) {
  const set = <K extends keyof Preferences>(key: K, next: Preferences[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className={compact ? 'preferences-embedded' : 'setup-screen'}>
      {!compact && (
        <>
          <h1>{t('What are you looking for?')}</h1>
          <p className="setup-subtitle">
            {t('These answers shape your profile, your target roles, and which job boards get scanned. Everything is optional and can be edited later in Settings.')}
          </p>
        </>
      )}

      <div className="preferences-form">
        <label>
          <span>{t('Target regions or countries')}</span>
          <input value={value.regions} onChange={(e) => set('regions', e.target.value)} placeholder={t('Germany, Netherlands')} />
        </label>
        <label>
          <span>{t('Role keywords or job titles')}</span>
          <input value={value.keywords} onChange={(e) => set('keywords', e.target.value)} placeholder={t('Manufacturing Engineer, Project Leader')} />
        </label>
        <label>
          <span>{t('Industry or domain')}</span>
          <input value={value.industries} onChange={(e) => set('industries', e.target.value)} placeholder={t('Automotive, Semiconductor, Medical devices')} />
        </label>
        <label>
          <span>{t('Expected salary')}</span>
          <input value={value.salary} onChange={(e) => set('salary', e.target.value)} placeholder={t('EUR 70k-85k gross per year')} />
        </label>
        <fieldset>
          <legend>{t('Willing to relocate?')}</legend>
          <div className="ai-segment" role="radiogroup" aria-label={t('Willing to relocate?')}>
            {RELOCATION.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={value.relocation === option.id}
                className={value.relocation === option.id ? 'selected' : ''}
                onClick={() => set('relocation', option.id)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          <span>{t('Preferred cities')}</span>
          <input value={value.preferredCities} onChange={(e) => set('preferredCities', e.target.value)} placeholder={t('Hamburg, Munich')} />
        </label>
        <label>
          <span>{t('Anything else the AI should know')}</span>
          <textarea rows={3} value={value.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('Deal-breakers, visa situation, earliest start date')} />
        </label>
      </div>

      <div className="setup-actions">
        <button className="btn-primary" onClick={onContinue}>{continueLabel ?? t('Continue')}</button>
      </div>
    </div>
  );
}
