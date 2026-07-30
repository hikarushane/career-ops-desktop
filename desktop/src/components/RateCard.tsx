/**
 * A rate rendered as a percentage.
 *
 * `ComputeProgressMetrics` (dashboard/internal/data/career.go) already multiplies
 * ResponseRate/InterviewRate/OfferRate by 100 before emitting them — measured
 * directly against both the fixture and the real 30-row tracker (e.g.
 * ResponseRate came back `50`, not `0.5`). Multiplying by 100 again here would
 * render "5000%". This component expects an already-0-100 value and only
 * formats it; it does not rescale.
 */
export default function RateCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rate">
      <div className="rate-value">{value.toFixed(0)}%</div>
      <div className="rate-label">{label}</div>
    </div>
  );
}

/** A raw count. Separate from RateCard so a count is never shown as a percent. */
export function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rate">
      <div className="rate-value">{value}</div>
      <div className="rate-label">{label}</div>
    </div>
  );
}
