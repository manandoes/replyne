"use client";

import { useState, type KeyboardEvent } from "react";
import { cn } from "@shared/ui";

type Point = { date: string; value: number };

const PLOT_HEIGHT = 168;
const LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const FULL = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

const dayLabel = (iso: string) => LABEL.format(new Date(`${iso}T00:00:00Z`));
const fullDay = (iso: string) => FULL.format(new Date(`${iso}T00:00:00Z`));

/** Smallest 1/2/5 × 10^n at or above the max, so ticks are clean numbers. */
function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) if (step * power >= max) return step * power;
  return 10 * power;
}

/**
 * Single-series column chart (one hue, no legend — the heading names it).
 * Columns ≤24px with 4px rounded tops and a 2px gap; hairline gridlines.
 * Hover or arrow keys show a tooltip; the table view carries every value.
 */
export function DailyChart({ title, unit, data }: { title: string; unit: string; data: Point[] }) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceCeil(Math.max(0, ...data.map((point) => point.value)));
  const ticks = top % 2 === 0 ? [top, top / 2, 0] : [top, 0];
  const pct = (value: number) => `${(value / top) * 100}%`;
  const current = active === null ? null : data[active];

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    setActive((index) => {
      const last = data.length - 1;
      if (event.key === "Home") return 0;
      if (event.key === "End") return last;
      const start = index ?? last;
      return event.key === "ArrowLeft" ? Math.max(0, start - 1) : Math.min(last, start + 1);
    });
  }

  const middle = Math.floor((data.length - 1) / 2);

  return (
    <figure className="space-y-2">
      <div className="flex gap-2">
        <div className="relative w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground" style={{ height: PLOT_HEIGHT }} aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 translate-y-1/2" style={{ bottom: pct(tick) }}>
              {tick.toLocaleString("en-US")}
            </span>
          ))}
        </div>
        <div
          role="group"
          aria-label={`${title}. Use the left and right arrow keys to read each day.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((index) => index ?? data.length - 1)}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          className="relative flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ height: PLOT_HEIGHT }}
        >
          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden
              className={cn("absolute inset-x-0 border-t", tick === 0 ? "border-viz-axis" : "border-border")}
              style={{ bottom: pct(tick) }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-0.5" aria-hidden>
            {data.map((point, index) => (
              <div
                key={point.date}
                className="flex h-full flex-1 items-end justify-center"
                onPointerEnter={() => setActive(index)}
              >
                {point.value > 0 && (
                  <div
                    className={cn(
                      "w-full max-w-6 rounded-t-sm bg-viz-series transition-[filter]",
                      active === index && "brightness-125"
                    )}
                    style={{ height: pct(point.value) }}
                  />
                )}
              </div>
            ))}
          </div>
          {current && active !== null && (
            <div
              className={cn(
                "pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1.5 shadow-md",
                // Keep the tooltip inside the plot near either edge.
                active / data.length > 0.8 ? "-translate-x-full" : active / data.length < 0.2 ? "" : "-translate-x-1/2"
              )}
              style={{ left: `${((active + 0.5) / data.length) * 100}%` }}
            >
              <p className="text-sm font-semibold tabular-nums">
                {current.value.toLocaleString("en-US")} {current.value === 1 ? unit : `${unit}s`}
              </p>
              <p className="text-[11px] text-muted-foreground">{fullDay(current.date)}</p>
            </div>
          )}
          <p className="sr-only" aria-live="polite">
            {current ? `${fullDay(current.date)}: ${current.value} ${current.value === 1 ? unit : `${unit}s`}` : ""}
          </p>
        </div>
      </div>
      <div className="ml-10 flex justify-between text-[11px] text-muted-foreground" aria-hidden>
        <span>{data[0] ? dayLabel(data[0].date) : ""}</span>
        {data.length > 2 && data[middle] && <span>{dayLabel(data[middle].date)}</span>}
        <span>{data.at(-1) ? dayLabel(data.at(-1)!.date) : ""}</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Show as table</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-surface-muted">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-medium">Day (UTC)</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">{unit[0]?.toUpperCase()}{unit.slice(1)}s</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {data.map((point) => (
                <tr key={point.date}>
                  <td className="px-3 py-1">{fullDay(point.date)}</td>
                  <td className="px-3 py-1 text-right">{point.value.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
