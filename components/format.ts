/**
 * Display formatting for server-rendered pages. Dates are shown in UTC with a
 * label, so what the server renders is what everyone sees.
 */

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const formatDate = (date: Date) => DATE.format(date);
export const formatShortDate = (date: Date) => SHORT_DATE.format(date);
export const formatDateTime = (date: Date) => DATE_TIME.format(date);
export const formatCount = (value: number) => (value < 10_000 ? value.toLocaleString("en-US") : COMPACT.format(value));

export function formatRelative(date: Date, now = new Date()): string {
  const seconds = (now.getTime() - date.getTime()) / 1000;
  if (seconds < 45) return "just now";
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)} h ago`;
  if (seconds < 7 * 86_400) return `${Math.round(seconds / 86_400)} d ago`;
  return formatDate(date);
}

/** "in 5 h", "in 2 d" — for retention deadlines. */
export function formatUntil(date: Date, now = new Date()): string {
  const hours = (date.getTime() - now.getTime()) / 3_600_000;
  if (hours <= 1) return "within the hour";
  if (hours < 48) return `in ${Math.round(hours)} h`;
  return `in ${Math.round(hours / 24)} d`;
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
