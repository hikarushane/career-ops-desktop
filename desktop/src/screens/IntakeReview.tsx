import { useCallback, useEffect, useState } from 'react';
import type { IntakeProposal } from '../api';
import { applyIntakeProposal, previewIntakeProposal } from '../lib/runner';

type Props = { root: string; onBack: () => void; onComplete: () => void };

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export default function IntakeReview({ root, onBack, onComplete }: Props) {
  const [proposal, setProposal] = useState<IntakeProposal | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await previewIntakeProposal(root);
      setProposal(next);
      setApproved(new Set());
    } catch (reason) {
      setProposal(null);
      setError(errorMessage(reason, 'The intake preview could not be completed. Try again.'));
    } finally {
      setLoading(false);
    }
  }, [root]);

  useEffect(() => {
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
    if (proposal) setApproved(new Set(proposal.items.map((item) => item.id)));
  }, [proposal]);

  const applySelected = useCallback(async () => {
    if (!proposal || approved.size === 0 || applying) return;
    const approvedIds = proposal.items
      .filter((item) => approved.has(item.id))
      .map((item) => item.id);
    if (approvedIds.length === 0) return;

    setApplying(true);
    setError(null);
    try {
      await applyIntakeProposal(root, proposal, approvedIds);
      onComplete();
    } catch (reason) {
      setError(errorMessage(reason, 'The selected changes could not be applied. Try again.'));
    } finally {
      setApplying(false);
    }
  }, [applying, approved, onComplete, proposal, root]);

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
          <button className="btn-ghost" onClick={onBack}>Back</button>
          <button className="btn-primary" onClick={onComplete}>Continue setup</button>
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
        <button className="btn-ghost" onClick={onBack} disabled={applying}>Back</button>
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
