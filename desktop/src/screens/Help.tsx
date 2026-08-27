import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { helpDocument, languageSettings, type HelpDocument } from '../api';

type Section = 'scores' | 'scanner' | 'ai-does' | 'ai-doesnt' | 'privacy' | 'troubleshoot' | 'advanced';

const SECTIONS: { key: Section; title: string; body: string }[] = [
  { key: 'scores', title: 'How scores work', body: 'Each job is scored 1.0-5.0 across fit, compensation, growth, culture, and legitimacy. Scores above 4.0 are strong matches.' },
  { key: 'scanner', title: 'How scanning works', body: 'The scanner checks configured company career pages (Greenhouse, Lever, Ashby APIs) for new postings matching your target roles. Zero AI cost for discovery.' },
  { key: 'ai-does', title: 'What AI does', body: 'AI analyses job postings against your background, generates tailored CVs, prepares interview answers, and drafts cover letters. It reads your profile but never submits applications.' },
  { key: 'ai-doesnt', title: 'What AI does NOT do', body: 'AI never auto-submits applications, sends emails, clicks submit buttons, or shares your data externally. You always confirm before any action goes out.' },
  { key: 'privacy', title: 'Privacy', body: 'All your data stays on your machine in plain files. Nothing is uploaded to any server except what you explicitly send to the AI provider for analysis.' },
  { key: 'troubleshoot', title: 'Troubleshooting', body: 'If the sidecar fails to start, run "npm run build:sidecar" from the desktop directory. If an AI provider shows Error state, reinstall it or check authentication.' },
  { key: 'advanced', title: 'Advanced', body: 'Power users can edit cv.md, config/profile.yml, modes/_profile.md, and portals.yml directly. The CLI modes (scan, pdf, batch, etc.) are available in any supported coding CLI.' },
];

type Props = { root: string };

export default function Help({ root }: Props) {
  const [open, setOpen] = useState<Section | null>(null);
  const [document, setDocument] = useState<HelpDocument | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    languageSettings(root)
      .then((settings) => helpDocument(root, settings.analysisLanguage))
      .then((result) => active && setDocument(result))
      .catch((reason) => active && setDocumentError(String(reason)));
    return () => { active = false; };
  }, [root]);

  return (
    <div className="help-screen">
      <h1>Help</h1>
      <div className="help-sections">
        {SECTIONS.map((s) => (
          <div key={s.key} className="help-section">
            <button className="help-section-header" onClick={() => setOpen(open === s.key ? null : s.key)}>
              <span>{s.title}</span>
              <span>{open === s.key ? '−' : '+'}</span>
            </button>
            {open === s.key && <p className="help-section-body">{s.body}</p>}
          </div>
        ))}
      </div>
      <section className="help-readme">
        <h2>Full guide</h2>
        {documentError && <p className="language-error" role="alert">{documentError}</p>}
        {!document && !documentError && <p className="setup-hint">Loading guide…</p>}
        {document && (
          <details>
            <summary>
              {document.fallback ? 'English guide' : `Guide (${document.language})`}
            </summary>
            <article className="help-readme-content"><ReactMarkdown>{document.markdown}</ReactMarkdown></article>
          </details>
        )}
      </section>
    </div>
  );
}
