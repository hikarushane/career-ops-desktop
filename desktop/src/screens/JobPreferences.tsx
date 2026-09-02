import type { JobPreferences as Preferences, Relocation } from '../lib/jobPreferences';

type Props = {
  value: Preferences;
  onChange: (next: Preferences) => void;
  onContinue: () => void;
};

const RELOCATION: { id: Relocation; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'no', label: 'No' },
];

export default function JobPreferences({ value, onChange, onContinue }: Props) {
  const set = <K extends keyof Preferences>(key: K, next: Preferences[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="setup-screen">
      <h1>What are you looking for?</h1>
      <p className="setup-subtitle">
        These answers shape your profile, your target roles, and which job boards get scanned.
        Everything is optional and can be edited later in Settings.
      </p>

      <div className="preferences-form">
        <label>
          <span>Target regions or countries</span>
          <input value={value.regions} onChange={(e) => set('regions', e.target.value)} placeholder="Germany, Netherlands" />
        </label>
        <label>
          <span>Role keywords or job titles</span>
          <input value={value.keywords} onChange={(e) => set('keywords', e.target.value)} placeholder="Manufacturing Engineer, Project Leader" />
        </label>
        <label>
          <span>Expected salary</span>
          <input value={value.salary} onChange={(e) => set('salary', e.target.value)} placeholder="EUR 70k-85k gross per year" />
        </label>
        <fieldset>
          <legend>Willing to relocate?</legend>
          <div className="ai-segment" role="radiogroup" aria-label="Willing to relocate">
            {RELOCATION.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={value.relocation === option.id}
                className={value.relocation === option.id ? 'selected' : ''}
                onClick={() => set('relocation', option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          <span>Preferred cities</span>
          <input value={value.preferredCities} onChange={(e) => set('preferredCities', e.target.value)} placeholder="Hamburg, Munich" />
        </label>
        <label>
          <span>Anything else the AI should know</span>
          <textarea rows={3} value={value.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Deal-breakers, visa situation, earliest start date" />
        </label>
      </div>

      <div className="setup-actions">
        <button className="btn-primary" onClick={onContinue}>Continue</button>
      </div>
    </div>
  );
}
