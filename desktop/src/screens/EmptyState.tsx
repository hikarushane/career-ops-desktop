type Props = {
  root: string | null;
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

export default function EmptyState({ root, missing, onPick }: Props) {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 48 }}>
      <h1 style={{ marginTop: 0 }}>career-ops is not set up yet</h1>

      <p style={{ color: 'var(--subtext)' }}>
        {root ? <>Looking in <code>{root}</code>.</> : 'No career-ops folder selected.'}
      </p>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {missing.map((f) => (
          <li
            key={f}
            style={{
              background: 'var(--surface)',
              borderLeft: '3px solid var(--peach)',
              padding: '12px 16px',
              marginBottom: 8,
              borderRadius: 4,
            }}
          >
            <code style={{ color: 'var(--peach)' }}>{f}</code>
            <div style={{ color: 'var(--subtext)', marginTop: 4 }}>{EXPLAIN[f] ?? ''}</div>
          </li>
        ))}
      </ul>

      <p style={{ color: 'var(--subtext)' }}>
        Onboarding happens in the CLI. Open career-ops in your AI coding CLI and it will walk you
        through creating these. This window picks up the result on Reload.
      </p>

      <button
        onClick={onPick}
        style={{
          background: 'var(--blue)',
          color: 'var(--base)',
          border: 0,
          borderRadius: 4,
          padding: '8px 16px',
          cursor: 'pointer',
        }}
      >
        {root ? 'Choose a different folder' : 'Choose your career-ops folder'}
      </button>
    </main>
  );
}
