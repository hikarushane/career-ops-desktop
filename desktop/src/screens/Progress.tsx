import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Progress as ProgressData } from '../api';
import RateCard, { CountCard } from '../components/RateCard';

const AXIS = { stroke: 'var(--color-text-secondary)', fontSize: 12 };
// Grid lines are one step off the surface and explicitly solid: Recharts'
// CartesianGrid has no default strokeDasharray (confirmed against the
// installed v3.10.1 API docs), so this is not overriding a dashed default —
// it is making the "solid, never dashed" choice explicit rather than relying
// on an implicit default that a future Recharts version could change.
const GRID = 'var(--color-surface-muted)';
// Mark spec: bars stay thin and never stretch to fill their slot. This
// matters concretely here — the real 30-row tracker collapses to only two
// weekly-activity bars, which without a cap would stretch nearly the full
// card width.
const MAX_BAR_SIZE = 24;
const TOOLTIP_STYLE = { background: 'var(--color-canvas)', border: `1px solid ${GRID}`, color: 'var(--color-text-primary)' };
// Recharts' default tooltip item colors its value text with the series fill
// (confirmed by hovering a bar during verification — the value rendered in
// the series color instead of body text). Every chart on this screen is
// single-series, so no identity is lost by keeping tooltip text on a text
// token instead.
const TOOLTIP_ITEM_STYLE = { color: 'var(--color-text-primary)' };
// The hovered bar lifts slightly so hover state is visible on the mark
// itself, not just in the tooltip.
const ACTIVE_BAR = { fillOpacity: 0.8 };

export default function Progress({ data }: { data: ProgressData }) {
  // .trim(): ScoreBucket's "<3.0" label carries two leading spaces in the Go
  // source (career.go), padding meant for the TUI's monospace grid. Left in,
  // it reads as a stray gap before the label in a proportional-font axis
  // tick. Applied defensively to all three series.
  const funnel = data.FunnelStages.map((s) => ({ name: s.Label.trim(), count: s.Count, pct: s.Pct }));
  const buckets = data.ScoreBuckets.map((b) => ({ name: b.Label.trim(), count: b.Count }));
  const weeks = data.WeeklyActivity.map((w) => ({ name: w.Week.trim(), count: w.Count }));

  // Score buckets are ordered from the highest band down, so the first two get
  // the "good" colors. This mirrors the score bands the table uses (Task 7's
  // --score-* tokens), which is the "status" color job, not categorical: score
  // means good/bad, so it wears the reserved score tokens rather than a
  // generated series color.
  const bucketColor = (i: number) =>
    ['var(--score-high)', 'var(--score-mid)', 'var(--score-neutral)', 'var(--score-neutral)', 'var(--score-low)'][i]
    ?? 'var(--score-neutral)';

  // The funnel bars deliberately stay one flat hue rather than an ordinal
  // lightness ramp. dataviz's color-formula.md calls out "funnel stage" as
  // the textbook ordinal case (one hue, monotone lightness steps) — an
  // opacity-ramped version of this was tried and validator-rejected against
  // the prior dark palette (steps too close in OKLCH L, lightest step under
  // the contrast floor against its card surface). That numeric result was
  // specific to the old hex values and hasn't been re-run against
  // DESIGN.md's light palette, but the structural reason still holds
  // either way: bar length already encodes the funnel's order and
  // magnitude unambiguously, so a flat hue loses no information. Now using
  // --color-primary (green), DESIGN.md's one sanctioned accent for
  // interactive/primary marks.
  const funnelColor = 'var(--color-primary)';

  return (
    <div className="pane">
      <div className="progress-grid">
        <section className="card">
          <h2>Funnel</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="none" horizontal={false} />
              <XAxis type="number" {...AXIS} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={90} {...AXIS} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                formatter={(value, _name, item) => {
                  const pct = (item?.payload as { pct: number } | undefined)?.pct ?? 0;
                  return [`${value} (${pct.toFixed(0)}%)`, 'Count'];
                }}
              />
              <Bar dataKey="count" fill={funnelColor} radius={[0, 4, 4, 0]} maxBarSize={MAX_BAR_SIZE} activeBar={ACTIVE_BAR} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>Score distribution</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={buckets}>
              <CartesianGrid stroke={GRID} strokeDasharray="none" vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]} maxBarSize={MAX_BAR_SIZE} activeBar={ACTIVE_BAR}>
                {buckets.map((b, i) => <Cell key={b.name} fill={bucketColor(i)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>Rates</h2>
          <div className="rates">
            <RateCard label="Response" value={data.ResponseRate} />
            <RateCard label="Interview" value={data.InterviewRate} />
            <RateCard label="Offer" value={data.OfferRate} />
          </div>
          <div className="rates" style={{ marginTop: 20 }}>
            <CountCard label="Active" value={data.ActiveApps} />
            <CountCard label="Offers" value={data.TotalOffers} />
          </div>
        </section>

        <section className="card">
          <h2>Weekly activity</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeks}>
              <CartesianGrid stroke={GRID} strokeDasharray="none" vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Bar dataKey="count" name="Count" fill="var(--color-accent-teal)" radius={[4, 4, 0, 0]} maxBarSize={MAX_BAR_SIZE} activeBar={ACTIVE_BAR} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
    </div>
  );
}
