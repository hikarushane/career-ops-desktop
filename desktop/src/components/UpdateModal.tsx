import type { UpdateState } from '../lib/updater';

type Props = {
  state: UpdateState;
  onUpdate: () => void;
  onClose: () => void;
};

export default function UpdateModal({ state, onUpdate, onClose }: Props) {
  const isLoading = state.status === 'downloading' || state.status === 'installing';

  return (
    <div className="update-overlay" onClick={isLoading ? undefined : onClose}>
      <div className="update-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="update-modal-title">
          {state.status === 'error' ? 'Update Error' : 'Update Available'}
        </h2>

        {state.status === 'error' ? (
          <div className="update-error">
            <p>{state.error}</p>
          </div>
        ) : (
          <>
            <div className="update-versions">
              <div className="update-version-row">
                <span className="update-version-label">Current</span>
                <span className="update-version-value">{state.currentVersion}</span>
              </div>
              <div className="update-version-row">
                <span className="update-version-label">New</span>
                <span className="update-version-value">{state.availableVersion}</span>
              </div>
              {state.releaseDate && (
                <div className="update-version-row">
                  <span className="update-version-label">Published</span>
                  <span className="update-version-value">
                    {new Date(state.releaseDate).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {state.releaseNotes && (
              <div className="update-notes">
                <h3 className="update-notes-heading">Release Notes</h3>
                <div className="update-notes-body">{state.releaseNotes}</div>
              </div>
            )}
          </>
        )}

        <div className="update-modal-actions">
          {state.status === 'error' ? (
            <button className="btn-primary" onClick={onClose}>Close</button>
          ) : (
            <>
              <button
                className="btn-secondary"
                onClick={onClose}
                disabled={isLoading}
              >
                Later
              </button>
              <button
                className="btn-primary"
                onClick={onUpdate}
                disabled={isLoading}
              >
                {state.status === 'downloading' ? 'Downloading…' :
                 state.status === 'installing' ? 'Installing…' :
                 'Update Now'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
