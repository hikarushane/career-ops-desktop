import { useEffect, useRef } from 'react';
import { t } from '../lib/i18n';
import type { UpdateState } from '../lib/updater';

type Props = {
  state: UpdateState;
  onUpdate: () => void;
  onClose: () => void;
};

export default function UpdateModal({ state, onUpdate, onClose }: Props) {
  const isLoading = state.status === 'downloading' || state.status === 'installing';
  const modalRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const loadingRef = useRef(isLoading);
  const closeRef = useRef(onClose);
  loadingRef.current = isLoading;
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loadingRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;

      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    initialFocusRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="update-overlay"
      onMouseDown={(event) => {
        if (!isLoading && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="update-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
      >
        <h2 id="update-modal-title" className="update-modal-title">
          {state.status === 'error' ? t('Update Error') : t('Update Available')}
        </h2>

        {state.status === 'error' ? (
          <div className="update-error">
            <p>{state.error}</p>
          </div>
        ) : (
          <>
            <div className="update-versions">
              <div className="update-version-row">
                <span className="update-version-label">{t('Current')}</span>
                <span className="update-version-value">{state.currentVersion}</span>
              </div>
              <div className="update-version-row">
                <span className="update-version-label">{t('New')}</span>
                <span className="update-version-value">{state.availableVersion}</span>
              </div>
              {state.releaseDate && (
                <div className="update-version-row">
                  <span className="update-version-label">{t('Published')}</span>
                  <span className="update-version-value">
                    {new Date(state.releaseDate).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {state.releaseNotes && (
              <div className="update-notes">
                <h3 className="update-notes-heading">{t('Release Notes')}</h3>
                <div className="update-notes-body">{state.releaseNotes}</div>
              </div>
            )}
          </>
        )}

        <div className="update-modal-actions">
          {state.status === 'error' ? (
            <button ref={initialFocusRef} className="btn-primary" onClick={onClose}>{t('Close')}</button>
          ) : (
            <>
              <button
                ref={initialFocusRef}
                className="btn-secondary"
                onClick={onClose}
                disabled={isLoading}
              >
                {t('Later')}
              </button>
              <button
                className="btn-primary"
                onClick={onUpdate}
                disabled={isLoading}
              >
                {state.status === 'downloading' ? t('Downloading…') :
                 state.status === 'installing' ? t('Installing…') :
                 t('Update Now')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
