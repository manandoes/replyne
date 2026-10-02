import {
  FEEDBACK_REASON_LABELS,
  NEGATIVE_REASONS,
  POSITIVE_REASONS,
  type FeedbackReason,
} from "../contracts";
import type { ValidationIssue } from "../draft-validation";
import { Button, cn } from "./index";

/** Draft checks, identical in the extension and the dashboard. */
export function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1" aria-label="Draft checks">
      {issues.map((issue, index) => (
        <li
          key={`${issue.code}-${index}`}
          className={cn(
            "rounded border px-2 py-1 text-xs",
            issue.severity === "block" ? "border-danger/30 bg-danger-surface" : "border-warning/30 bg-warning-surface"
          )}
        >
          <span className="font-medium">{issue.severity === "block" ? "Fix before copying: " : "Check: "}</span>
          {issue.message}
          {issue.excerpt && <span className="text-muted-foreground"> — “{issue.excerpt}”</span>}
        </li>
      ))}
    </ul>
  );
}

export type Rating = "up" | "down";

/** Yes/No rating plus reason chips. The caller persists every change. */
export function FeedbackControl({
  rating,
  reasons,
  onChange,
  disabled = false,
}: {
  rating: Rating | null;
  reasons: FeedbackReason[];
  onChange: (rating: Rating, reasons: FeedbackReason[]) => void;
  disabled?: boolean;
}) {
  const choices = rating === "up" ? POSITIVE_REASONS : rating === "down" ? NEGATIVE_REASONS : [];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Was this draft useful?</span>
        <Button
          size="sm"
          variant={rating === "up" ? "primary" : "secondary"}
          aria-pressed={rating === "up"}
          disabled={disabled}
          onClick={() => onChange("up", rating === "up" ? reasons : [])}
        >
          Yes
        </Button>
        <Button
          size="sm"
          variant={rating === "down" ? "primary" : "secondary"}
          aria-pressed={rating === "down"}
          disabled={disabled}
          onClick={() => onChange("down", rating === "down" ? reasons : [])}
        >
          No
        </Button>
      </div>
      {rating && choices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {choices.map((reason) => {
            const active = reasons.includes(reason);
            return (
              <Button
                key={reason}
                size="sm"
                variant={active ? "primary" : "ghost"}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => onChange(rating, active ? reasons.filter((r) => r !== reason) : [...reasons, reason])}
              >
                {FEEDBACK_REASON_LABELS[reason]}
              </Button>
            );
          })}
        </div>
      )}
      {rating && (
        <p className="text-[11px] text-muted-foreground">
          Thanks — feedback tunes drafts for this brand profile only.
        </p>
      )}
    </div>
  );
}
