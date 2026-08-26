const ACTIONS_BY_STATUS: Record<string, { label: string; taskType?: string }[]> = {
  evaluated: [
    { label: 'Generate tailored CV', taskType: 'pdf' },
    { label: 'Open job posting' },
    { label: 'Research company', taskType: 'deep' },
  ],
  applied: [
    { label: 'Follow up' },
  ],
  interview: [
    { label: 'Prepare interview', taskType: 'interview-prep' },
    { label: 'Practice interview', taskType: 'interview-practice' },
    { label: 'Debrief interview', taskType: 'interview-debrief' },
  ],
  offer: [
    { label: 'Review offer' },
  ],
};

type Props = {
  normStatus: string;
  onAction: (action: string) => void;
};

export default function NextActions({ normStatus, onAction }: Props) {
  const actions = ACTIONS_BY_STATUS[normStatus];
  if (!actions || actions.length === 0) return null;

  return (
    <div className="next-actions">
      <h4 className="next-actions-title">Next Steps</h4>
      <div className="next-actions-list">
        {actions.map((a) => (
          <button key={a.label} className="btn-secondary" onClick={() => onAction(a.taskType ?? a.label)}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
