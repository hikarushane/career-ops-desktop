import { useEffect, useState } from 'react';
import {
  languageSettings,
  setAnalysisLanguage,
  type LanguageOption,
} from '../api';
import { t } from '../lib/i18n';

type Props = {
  root: string;
  onSaved?: () => void;
};

export default function AnalysisLanguageField({ root, onSaved }: Props) {
  const [options, setOptions] = useState<LanguageOption[]>([]);
  const [language, setLanguage] = useState('en');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    languageSettings(root)
      .then((settings) => {
        if (!active) return;
        setOptions(settings.options);
        setLanguage(settings.analysisLanguage);
      })
      .catch((reason) => active && setError(String(reason)));
    return () => { active = false; };
  }, [root]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setAnalysisLanguage(root, language);
      onSaved?.();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="analysis-language-field">
      <h2>{t('Analysis Language')}</h2>
      <p>
        {t("CareerOps job analyses use this language. Your CV, cover letter, and interview practice still follow the job description's original language.")}
      </p>
      <label>
        <span>{t('Analysis language')}</span>
        <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={saving}>
          {options.map((option) => (
            <option key={option.code} value={option.code}>{option.name}</option>
          ))}
        </select>
      </label>
      {error && <p className="language-error" role="alert">{error}</p>}
      <button className="btn-primary" onClick={save} disabled={saving || options.length === 0}>
        {saving ? t('Saving…') : t('Save analysis language')}
      </button>
    </section>
  );
}
