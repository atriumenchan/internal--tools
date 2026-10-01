import { cn } from "@/lib/utils";

export type ChartSlice = { label: string; value: number; color: string };

export function Donut({
  slices,
  size = 176,
  thickness = 20,
  centerValue,
  centerHint,
}: {
  slices: ChartSlice[];
  size?: number;
  thickness?: number;
  centerValue: string;
  centerHint: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Task outcome split">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={thickness}
        />
        {total > 0
          ? slices.map((slice) => {
              if (slice.value <= 0) return null;
              const length = (slice.value / total) * circumference;
              const dash = `${length} ${circumference - length}`;
              const node = (
                <circle
                  key={slice.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={thickness}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                >
                  <title>{`${slice.label}: ${slice.value}`}</title>
                </circle>
              );
              offset += length;
              return node;
            })
          : null}
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          className="fill-ink font-display"
          style={{ fontSize: 30, fontWeight: 500 }}
        >
          {centerValue}
        </text>
        <text x="50%" y="63%" textAnchor="middle" className="fill-muted" style={{ fontSize: 11 }}>
          {centerHint}
        </text>
      </svg>
      <ul className="min-w-0 space-y-2">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: slice.color }} aria-hidden />
            <span className="min-w-0 truncate text-muted">{slice.label}</span>
            <span className="ml-auto font-mono tabular-nums text-ink">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StackedBars({
  rows,
  emptyLabel = "Nothing to show yet.",
}: {
  rows: { id: string; label: string; total: number; segments: ChartSlice[] }[];
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-faint">{emptyLabel}</p>;
  }
  const widest = Math.max(...rows.map((row) => row.total), 1);

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] font-medium text-ink">{row.label}</span>
            <span className="font-mono text-[12px] tabular-nums text-muted">{row.total}</span>
          </div>
          <div
            className="mt-1.5 flex h-2.5 overflow-hidden rounded-[3px] bg-surface-2"
            style={{ width: `${Math.max((row.total / widest) * 100, 4)}%` }}
          >
            {row.segments.map((segment) =>
              segment.value > 0 ? (
                <span
                  key={segment.label}
                  title={`${segment.label}: ${segment.value}`}
                  style={{ background: segment.color, width: `${(segment.value / row.total) * 100}%` }}
                />
              ) : null
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TrendBars({
  points,
  seriesA,
  seriesB,
}: {
  points: { label: string; a: number; b: number }[];
  seriesA: { label: string; color: string };
  seriesB: { label: string; color: string };
}) {
  const peak = Math.max(...points.map((point) => Math.max(point.a, point.b)), 1);

  return (
    <div>
      <div className="flex items-end gap-2">
        {points.map((point) => (
          <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex h-32 w-full items-end justify-center gap-1">
              <span
                title={`${seriesA.label}: ${point.a}`}
                className="w-1/3 rounded-t-[2px]"
                style={{ background: seriesA.color, height: `${Math.max((point.a / peak) * 100, point.a > 0 ? 3 : 0)}%` }}
              />
              <span
                title={`${seriesB.label}: ${point.b}`}
                className="w-1/3 rounded-t-[2px]"
                style={{ background: seriesB.color, height: `${Math.max((point.b / peak) * 100, point.b > 0 ? 3 : 0)}%` }}
              />
            </div>
            <span className="truncate text-[11px] text-faint">{point.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-muted">
        {[seriesA, seriesB].map((series) => (
          <span key={series.label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: series.color }} aria-hidden />
            {series.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-3 shadow-card">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-2xl font-medium tabular",
          tone === "ok" && "text-teal",
          tone === "warn" && "text-amber",
          tone === "danger" && "text-coral"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
