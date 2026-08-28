type Props = {
  root: string;
  missing: string[];
  onPick: () => void;
};

const EXPLAIN: Record<string, string> = {
  'cv.md': 'Your CV in markdown. career-ops reads every metric from here.',
  'config/profile.yml': 'Name, location, target roles, comp range.',
  'modes/_profile.md': 'Your personalization layer. Updates never overwrite it.',
  'portals.yml': 'Which companies and job boards the scanner searches.',
  'data/applications.md': 'The tracker. Nothing appears in this dashboard until it exists.',
};

// No shell here — App.tsx renders this before the sidebar/header mount
// (no folder chosen yet). Amber, not red: nothing is broken, setup is
// just incomplete. See desktop/STITCH-PROMPT.md §6.7.
export default function EmptyState({ root, missing, onPick }: Props) {
  return (
    <main className="state-screen" style={{ maxWidth: 640, margin: '0 auto', padding: 48 }}>
      <h1 className="state-title" style={{ marginTop: 0 }}>career-ops is not set up yet</h1>

      <p style={{ color: 'var(--color-text-secondary)' }}>
        Looking in <code style={{ fontFamily: 'var(--font-mono)' }}>{root}</code>.
      </p>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {missing.map((f) => (
          <li
            key={f}
            style={{
              background: 'var(--color-surface-subtle)',
              borderLeft: '3px solid var(--color-accent-amber)',
              padding: '12px 16px',
              marginBottom: 8,
              borderRadius: 4,
            }}
          >
            <code style={{ color: 'var(--color-accent-amber)', fontFamily: 'var(--font-mono)' }}>{f}</code>
            <div style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>{EXPLAIN[f] ?? ''}</div>
          </li>
        ))}
      </ul>

      <p style={{ color: 'var(--color-text-secondary)' }}>
        Onboarding happens in the CLI. Open career-ops in your AI coding CLI and it will walk you
        through creating these. This window picks up the result on Reload.
      </p>

      <button className="btn-primary" onClick={onPick}>
        Choose another location
      </button>
    </main>
  );
}
