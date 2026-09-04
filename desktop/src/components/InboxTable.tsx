import type { InboxEntry } from '../api';
import { processPendingLabel } from '../lib/batch';
import { matchesInboxSearch } from '../lib/filters';
import { t } from '../lib/i18n';
import { openJobUrl } from '../lib/opener';

type Props = {
  entries: InboxEntry[];
  query: string;
  onProcessPending: () => void;
  /** A batch start is in flight: the button is disabled to stop a double start. */
  batchStarting: boolean;
  /** A batch is already running: the button reopens it instead of starting another. */
  batchRunning: boolean;
  onOpenError: (message: string) => void;
};

/**
 * Pipeline's INBOX tab: scanned postings from data/pipeline.md that no
 * evaluation has turned into a tracker row yet. Read-only by design — the
 * one action is the same batch start Home offers; a row becomes a Job only
 * through evaluation. Same derived table language as AppTable (DESIGN.md
 * defines no table); the attention pill follows §5.9 chip geometry.
 */
export default function InboxTable({ entries, query, onProcessPending, batchStarting, batchRunning, onOpenError }: Props) {
  const rows = entries.filter((e) => matchesInboxSearch(e, query));
  const pending = entries.filter((e) => e.state === 'pending').length;
  const failed = entries.length - pending;

  return (
    <div className="inbox">
      <div className="inbox-header">
        <p className="inbox-summary">
          {`${t('{n} pending', { n: pending })}${failed > 0 ? ` · ${t('{n} need attention', { n: failed })}` : ''}. `}
          {t('Scanned postings wait here until an evaluation turns them into Jobs.')}
        </p>
        <button className="btn-primary" disabled={(pending === 0 && !batchRunning) || batchStarting} onClick={onProcessPending}>
          {processPendingLabel(pending, batchRunning)}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="inbox-empty">
          {entries.length === 0
            ? t('Inbox is empty. Run Find matching jobs to fill it.')
            : t('No inbox entries match your search.')}
        </p>
      ) : (
        <table className="apps">
          <thead>
            <tr>
              <th>{t('Company')}</th>
              <th>{t('Role')}</th>
              <th>{t('Location')}</th>
              <th>{t('Posted')}</th>
              <th><span className="sr-only">{t('Posting')}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.url}>
                <td>{e.company}</td>
                <td>
                  {e.role}
                  {e.state === 'failed' && <span className="inbox-attention">{t('Needs attention')}</span>}
                </td>
                <td className="inbox-location" title={e.location}>{e.location}</td>
                <td>{e.postedAt}</td>
                <td>
                  <button className="btn-link" onClick={() => void openJobUrl(e.url).then((err) => err && onOpenError(err))}>{t('Open posting')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
