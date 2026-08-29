import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyIntakeProposal,
  discardIntakePreview,
  previewIntakeProposal,
  type IntakePreviewSession,
} from '../lib/runner';

type Props = { root: string; onBack: () => void; onComplete: () => void };

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export default function IntakeReview({ root, onBack, onComplete }: Props) {
  const [session, setSession] = useState<IntakePreviewSession | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewStarted = useRef(false);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await previewIntakeProposal(root);
      setSession(next);
      setApproved(new Set());
    } catch (reason) {
      setSession(null);
      setError(errorMessage(reason, 'The intake preview could not be completed. Try again.'));
    } finally {
      setLoading(false);
    }
  }, [root]);

  useEffect(() => {
    if (previewStarted.current) return;
    previewStarted.current = true;
    void loadPreview();
  }, [loadPreview]);

  const toggleApproval = useCallback((id: string) => {
    setApproved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const approveAll = useCallback(() => {
    if (session) setApproved(new Set(session.proposal.items.map((item) => item.id)));
  }, [session]);

  const applySelected = useCallback(async () => {
    if (!session || approved.size === 0 || applying) return;
    const approvedIds = session.proposal.items
      .filter((item) => approved.has(item.id))
      .map((item) => item.id);
    if (approvedIds.length === 0) return;

    setApplying(true);
    setError(null);
    try {
      await applyIntakeProposal(root, session.intakeSessionId, approvedIds);
      onComplete();
    } catch (reason) {
      setError(errorMessage(reason, 'The selected changes could not be applied. Try again.'));
    } finally {
      setApplying(false);
    }
  }, [applying, approved, onComplete, root, session]);

  const skipForNow = useCallback(async () => {
    if (!session || applying) return;
    setError(null);
    try {
      await discardIntakePreview(session.intakeSessionId);
      onComplete();
    } catch (reason) {
      setError(errorMessage(reason, 'The intake session could not be closed. Try again.'));
    }
  }, [applying, onComplete, session]);

  const goBack = useCallback(async () => {
    if (!session || applying) return;
    setError(null);
    try {
      await discardIntakePreview(session.intakeSessionId);
      onBack();
    } catch (reason) {
      setError(errorMessage(reason, 'The intake session could not be closed. Try again.'));
    }
  }, [applying, onBack, session]);

  const proposal = session?.proposal ?? null;

  if (loading) {
    return (
      <div className="setup-screen" role="status">
        <h1>Review your background</h1>
        <p className="setup-subtitle">Scanning all new and changed evidence together…</p>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="setup-screen">
        <h1>Review your background</h1>
        {error && <p className="intake-error" role="alert">{error}</p>}
        <div className="setup-actions">
          <button className="btn-ghost" onClick={onBack}>Back</button>
          <button className="btn-primary" onClick={loadPreview}>Try again</button>
        </div>
      </div>
    );
  }

  if (proposal.items.length === 0) {
    return (
      <div className="setup-screen">
        <h1>Review your background</h1>
        <p className="setup-subtitle">No new profile changes were proposed.</p>
        <div className="setup-actions">
          <button className="btn-ghost" onClick={goBack}>Back</button>
          <button className="btn-primary" onClick={skipForNow}>Continue setup</button>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-screen intake-review-screen">
      <h1>Review your background</h1>
      <p className="setup-subtitle">
        Nothing changes until you approve it. Conflicts remain explicit for your decision.
      </p>

      <ul className="intake-review-list" aria-label="Background intake proposals">
        {proposal.items.map((item) => (
          <li key={item.id} className="intake-proposal-card">
            <dl className="intake-proposal-details">
              <div><dt>Target</dt><dd>{item.targetFile}</dd></div>
              <div><dt>Field</dt><dd>{item.field}</dd></div>
              <div><dt>Proposed value</dt><dd>{item.proposedValue}</dd></div>
              <div><dt>Source(s)</dt><dd>{item.sources.join(', ')}</dd></div>
            </dl>

            {item.conflict && (
              <section className="intake-conflict" aria-label={`Conflict for ${item.field}`}>
                <h2>Conflict</h2>
                <dl>
                  <div><dt>Current value</dt><dd>{item.conflict.existingValue}</dd></div>
                  <div><dt>Proposed value</dt><dd>{item.conflict.proposedValue}</dd></div>
                  <div><dt>Source</dt><dd>{item.sources.join(', ')}</dd></div>
                </dl>
              </section>
            )}

            <label className="intake-approval">
              <input
                type="checkbox"
                checked={approved.has(item.id)}
                onChange={() => toggleApproval(item.id)}
                disabled={applying}
              />
              Approve this change
            </label>
          </li>
        ))}
      </ul>

      {error && <p className="intake-error" role="alert">{error}</p>}
      <div className="setup-actions">
        <button className="btn-ghost" onClick={goBack} disabled={applying}>Back</button>
        <button className="btn-ghost" onClick={skipForNow} disabled={applying}>Skip for now</button>
        <button className="btn-secondary" onClick={approveAll} disabled={applying}>Approve all</button>
        <button
          className="btn-primary"
          onClick={applySelected}
          disabled={applying || approved.size === 0}
        >
          {applying ? 'Applying…' : 'Apply selected changes'}
        </button>
      </div>
    </div>
  );
}
