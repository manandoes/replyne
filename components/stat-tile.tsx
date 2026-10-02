import { Card, cn } from "@shared/ui";

/**
 * Stat tile: label · value · optional delta vs the previous period · sub-line.
 * The delta carries an arrow and signed text, so direction never relies on
 * color alone; its color says whether the change is good.
 */
export function StatTile({
  label,
  value,
  sub,
  change,
  period,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Fractional change vs the previous period; null hides the delta. */
  change?: number | null;
  period?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs">
        {change !== undefined && change !== null && <Delta change={change} period={period} />}
        {sub && <span className="text-muted-foreground">{sub}</span>}
      </div>
    </Card>
  );
}

function Delta({ change, period }: { change: number; period?: string }) {
  const rounded = Math.round(change * 100);
  if (rounded === 0) {
    return <span className="text-muted-foreground">No change{period ? ` vs ${period}` : ""}</span>;
  }
  const up = rounded > 0;
  return (
    <span className={cn("font-medium", up ? "text-success" : "text-danger")}>
      <span aria-hidden>{up ? "↑" : "↓"}</span> {up ? "+" : "−"}
      {Math.abs(rounded)}%<span className="font-normal text-muted-foreground">{period ? ` vs ${period}` : ""}</span>
    </span>
  );
}

/** Fractional change, or null when there's no previous baseline to compare to. */
export function changeBetween(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}
