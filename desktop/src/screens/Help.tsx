import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { helpDocument, languageSettings, type HelpDocument } from '../api';
import { openExternalUrl } from '../lib/opener';
import { stripHtmlPreamble } from '../lib/helpMarkdown';
import { t } from '../lib/i18n';
import { GitHubIcon } from '../components/icons';

type Section = 'scores' | 'scanner' | 'ai-does' | 'ai-doesnt' | 'privacy' | 'troubleshoot' | 'advanced';

const SECTIONS: { key: Section; title: string; body: string }[] = [
  { key: 'scores', title: 'How scores work', body: 'Each job is scored 1.0-5.0 across fit, compensation, growth, culture, and legitimacy. Scores above 4.0 are strong matches.' },
  { key: 'scanner', title: 'How scanning works', body: 'The scanner checks configured company career pages (Greenhouse, Lever, Ashby APIs) for new postings matching your target roles. Zero AI cost for discovery.' },
  { key: 'ai-does', title: 'What AI does', body: 'AI analyses job postings against your background, generates tailored CVs, prepares interview answers, and drafts cover letters. It reads your profile but never submits applications.' },
  { key: 'ai-doesnt', title: 'What AI does NOT do', body: 'AI never auto-submits applications, sends emails, clicks submit buttons, or shares your data externally. You always confirm before any action goes out.' },
  { key: 'privacy', title: 'Privacy', body: 'All your data stays on your machine in plain files. Nothing is uploaded to any server except what you explicitly send to the AI provider for analysis.' },
  { key: 'troubleshoot', title: 'Troubleshooting', body: 'If the CareerOps data service fails to start, reinstall or update CareerOps Desktop. If an AI provider shows Error state, reinstall it or check authentication.' },
  { key: 'advanced', title: 'Advanced', body: 'Power users can edit cv.md, config/profile.yml, modes/_profile.md, and portals.yml directly. The CLI modes (scan, pdf, batch, etc.) are available in any supported coding CLI.' },
];

/** The two languages profile-language.mjs --help-readme can serve (README.md is zh-TW, README.en.md is English). */
const GUIDE_LANGUAGES: { code: 'zh-TW' | 'en'; label: string }[] = [
  { code: 'zh-TW', label: '中文' },
  { code: 'en', label: 'English' },
];

export const DESKTOP_REPO_URL = 'https://github.com/hikarushane/career-ops-desktop';
export const UPSTREAM_REPO_URL = 'https://github.com/santifer/career-ops';

type Props = { root: string };

export default function Help({ root }: Props) {
  const [open, setOpen] = useState<Section | null>(null);
  const [document, setDocument] = useState<HelpDocument | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  // null until the workspace's analysis language is known; that picks the
  // default, and the toggle below overrides it for this visit only.
  const [guideLanguage, setGuideLanguage] = useState<'zh-TW' | 'en' | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    languageSettings(root)
      .then((settings) => active && setGuideLanguage(settings.analysisLanguage === 'zh-TW' ? 'zh-TW' : 'en'))
      .catch((reason) => active && setDocumentError(String(reason)));
    return () => { active = false; };
  }, [root]);

  useEffect(() => {
    if (!guideLanguage) return;
    let active = true;
    setDocument(null);
    helpDocument(root, guideLanguage)
      .then((result) => active && setDocument(result))
      .catch((reason) => active && setDocumentError(String(reason)));
    return () => { active = false; };
  }, [root, guideLanguage]);

  const openLink = (url: string) => {
    setLinkError(null);
    void openExternalUrl(url).then((err) => err && setLinkError(err));
  };

  return (
    <div className="help-screen">
      <h1>{t('Help')}</h1>
      <div className="help-sections">
        {SECTIONS.map((s) => (
          <div key={s.key} className="help-section">
            <button className="help-section-header" onClick={() => setOpen(open === s.key ? null : s.key)}>
              <span>{t(s.title)}</span>
              <span>{open === s.key ? '−' : '+'}</span>
            </button>
            {open === s.key && <p className="help-section-body">{t(s.body)}</p>}
          </div>
        ))}
      </div>
      <section className="help-readme">
        <div className="help-readme-toolbar">
          <h2>{t('Full guide')}</h2>
          <div className="ai-segment" role="radiogroup" aria-label={t('Guide language')}>
            {GUIDE_LANGUAGES.map((option) => (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={guideLanguage === option.code}
                onClick={() => setGuideLanguage(option.code)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {documentError && <p className="language-error" role="alert">{documentError}</p>}
        {!document && !documentError && <p className="setup-hint">{t('Loading guide…')}</p>}
        {document && (
          <details>
            <summary>
              {document.fallback ? t('English guide (no guide in this language yet)') : t('Guide ({language})', { language: document.language })}
            </summary>
            <article className="help-readme-content"><ReactMarkdown>{stripHtmlPreamble(document.markdown)}</ReactMarkdown></article>
          </details>
        )}
      </section>
      <footer className="help-footer">
        <a href={DESKTOP_REPO_URL} onClick={(e) => { e.preventDefault(); openLink(DESKTOP_REPO_URL); }}>
          <GitHubIcon size={18} />
          <span>github.com/hikarushane/career-ops-desktop</span>
        </a>
        <p>
          {t('CareerOps Desktop is a fork of')}{' '}
          <a href={UPSTREAM_REPO_URL} onClick={(e) => { e.preventDefault(); openLink(UPSTREAM_REPO_URL); }}>career-ops</a>
          {' '}{t('by santifer, which supplies the evaluation modes, scanners and scripts this app drives.')}
        </p>
        {linkError && <p className="intake-error" role="alert">{linkError}</p>}
      </footer>
    </div>
  );
}
