"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DraftResponse, FeedbackReason } from "@shared/contracts";
import { hasBlockingIssues, validateDraft, type DraftRules, type ValidationIssue } from "@shared/draft-validation";
import { Alert, Button, Input, Spinner, Textarea } from "@shared/ui";
import { FeedbackControl, IssueList, type Rating } from "@shared/ui/draft";
import { mutate } from "@/components/api-client";
import { ConfirmButton } from "@/components/confirm-button";

type Props = {
  draft: { id: string; text: string; issues: ValidationIssue[] };
  rules: DraftRules;
  /** e.g. /w/<id>/drafts — list page; drafts live at <draftsHref>/<draftId>. */
  draftsHref: string;
  canEdit: boolean;
  canRegenerate: boolean;
  regenerateBlockedReason: string | null;
  canRate: boolean;
  canDelete: boolean;
  myFeedback: { rating: Rating; reasons: FeedbackReason[] } | null;
};

const SAVE_DELAY_MS = 800;

export function DraftWorkbench(props: Props) {
  const router = useRouter();
  const [text, setText] = useState(props.draft.text);
  const [saved, setSaved] = useState({ text: props.draft.text, issues: props.draft.issues });
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [rating, setRating] = useState<Rating | null>(props.myFeedback?.rating ?? null);
  const [reasons, setReasons] = useState<FeedbackReason[]>(props.myFeedback?.reasons ?? []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedText = useRef(props.draft.text);

  const issues = text === saved.text ? saved.issues : validateDraft(text, props.rules);
  const blocked = hasBlockingIssues(issues);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function save(value: string): Promise<boolean> {
    if (value === savedText.current) {
      setSaveState("saved");
      return true;
    }
    setSaveState("saving");
    const result = await mutate<DraftResponse>(`/api/drafts/${props.draft.id}`, "PATCH", { text: value });
    if (!result.ok) {
      setSaveState("unsaved");
      setError(result.error);
      return false;
    }
    savedText.current = value;
    setSaved({ text: value, issues: result.data.draft.issues });
    setSaveState("saved");
    return true;
  }

  function onEdit(value: string) {
    setText(value);
    setCopied(false);
    setSaveState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(value), SAVE_DELAY_MS);
  }

  async function copy() {
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    if (props.canEdit && !(await save(text))) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Couldn't access the clipboard. Select the text and copy it manually.");
      return;
    }
    setCopied(true);
    await mutate(`/api/drafts/${props.draft.id}/copy`, "POST");
  }

  async function regenerate() {
    setRegenerating(true);
    setError(null);
    const result = await mutate<DraftResponse>(`/api/drafts/${props.draft.id}/regenerate`, "POST", {
      instruction: instruction.trim() || undefined,
    });
    setRegenerating(false);
    if (!result.ok) return setError(result.error);
    router.push(`${props.draftsHref}/${result.data.draft.id}`);
  }

  async function sendFeedback(nextRating: Rating, nextReasons: FeedbackReason[]) {
    setRating(nextRating);
    setReasons(nextReasons);
    const result = await mutate(`/api/drafts/${props.draft.id}/feedback`, "PUT", {
      rating: nextRating,
      reasons: nextReasons,
    });
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label htmlFor="draft-text" className="text-sm font-medium">
          Reply
        </label>
        {props.canEdit && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved changes" : "Saved"}
          </span>
        )}
      </div>
      <Textarea
        id="draft-text"
        rows={10}
        value={text}
        readOnly={!props.canEdit}
        onChange={(event) => onEdit(event.target.value)}
        className={props.canEdit ? undefined : "bg-surface-muted"}
      />
      {!props.canEdit && (
        <p className="text-xs text-muted-foreground">Only the draft&apos;s author can edit it. You can still copy and rate it.</p>
      )}
      <IssueList issues={issues} />
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copy()} disabled={blocked || !text.trim()}>
          {copied ? "Copied" : "Copy reply"}
        </Button>
        {props.canDelete && (
          <ConfirmButton
            title="Delete this draft?"
            description="The draft, its source text, and its feedback are deleted permanently. Other versions stay."
            confirmLabel="Delete draft"
            onConfirm={async () => {
              const result = await mutate(`/api/drafts/${props.draft.id}`, "DELETE");
              if (!result.ok) return result.error;
              router.push(props.draftsHref);
              return null;
            }}
          >
            Delete
          </ConfirmButton>
        )}
      </div>
      {copied && (
        <Alert tone="success">Copied. Review it once more, then paste and post it on Reddit yourself.</Alert>
      )}

      <div className="space-y-2 border-t border-border pt-4">
        <h2 className="text-sm font-medium">Regenerate</h2>
        {props.canRegenerate ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Adjust the next draft (optional)"
              placeholder="Adjust: e.g. shorter, mention the free plan"
              value={instruction}
              maxLength={300}
              onChange={(event) => setInstruction(event.target.value)}
            />
            <Button variant="secondary" onClick={() => void regenerate()} disabled={regenerating} className="shrink-0">
              {regenerating && <Spinner label="Regenerating" />}
              {regenerating ? "Drafting…" : "Regenerate"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{props.regenerateBlockedReason}</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Creates a new version from the same source text; this one stays in history.
        </p>
      </div>

      {props.canRate && (
        <div className="border-t border-border pt-4">
          <FeedbackControl rating={rating} reasons={reasons} onChange={(r, rs) => void sendFeedback(r, rs)} />
        </div>
      )}
    </div>
  );
}

export function DeleteSourceButton({ draftId }: { draftId: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      size="sm"
      title="Delete the source text now?"
      description="The captured Reddit text is removed immediately instead of at the end of its retention window. The draft stays, but it can no longer be regenerated."
      confirmLabel="Delete source text"
      onConfirm={async () => {
        const result = await mutate(`/api/drafts/${draftId}/captured-text`, "DELETE");
        if (!result.ok) return result.error;
        router.refresh();
        return null;
      }}
    >
      Delete source text now
    </ConfirmButton>
  );
}
