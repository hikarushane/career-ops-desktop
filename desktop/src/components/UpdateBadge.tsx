import { t } from '../lib/i18n';
import type { UpdateState } from '../lib/updater';

type Props = {
  state: UpdateState;
  onClick: () => void;
};

export default function UpdateBadge({ state, onClick }: Props) {
  if (state.status !== 'available') return null;

  return (
    <button
      className="update-badge"
      onClick={onClick}
      aria-label={t('Update available: {version}', { version: state.availableVersion ?? '' })}
    >
      <span className="update-badge-dot" />
      <span>{t('Update')}</span>
    </button>
  );
}
