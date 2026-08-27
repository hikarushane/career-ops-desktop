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
      aria-label={`Update available: ${state.availableVersion}`}
    >
      <span className="update-badge-dot" />
      <span>Update</span>
    </button>
  );
}
