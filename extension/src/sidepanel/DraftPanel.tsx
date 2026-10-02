import { useEffect, useRef, useState } from "react";
import type { DraftDto, FeedbackReason } from "@shared/contracts";
import { hasBlockingIssues, validateDraft, type DraftRules } from "@shared/draft-validation";
import { Alert, Badge, Button, Card, Input, Spinner, Textarea } from "@shared/ui";
import { FeedbackControl, IssueList, type Rating } from "@shared/ui/draft";
import type { ApiClient } from "../api";

type Props = {
  api: ApiClient;
  draft: DraftDto;
  rules: DraftRules;
  canRegenerate: boolean;
  dashboardUrl: string;
  onReplace: (draft: DraftDto) => void;
  onError: (error: unknown) => void;
};

const SAVE_DELAY_MS = 800;

export function DraftPanel({ api, draft, rules, canRegenerate, dashboardUrl, onReplace, onError }: Props) {
  const [text, setText] = useState(draft.text);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [rating, setRating] = useState<Rating | null>(null);
  const [reasons, setReasons] = useState<FeedbackReason[]>([]);
  // Issues from the server (which include the model's claim check) apply to the
  // text as generated or last saved; while editing, the same rules run locally.
  const [saved, setSaved] = useState({ text: draft.text, issues: draft.issues });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedText = useRef(draft.text);

  const issues = text === saved.text ? saved.issues : validateDraft(text, rules);
  const blocked = hasBlockingIssues(issues);

  async function save(value: string) {
    if (value === savedText.current) return setSaveState("saved");
    setSaveState("saving");
    try {
      const response = await api.updateDraft(draft.id, value);
      savedText.current = value;
      setSaved({ text: value, issues: response.draft.issues });
      setSaveState("saved");
    } catch (error) {
      setSaveState("unsaved");
      onError(error);
    }
  }

  function onEdit(value: string) {
    setText(value);
    setCopied(false);
    setSaveState("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(value), SAVE_DELAY_MS);
  }

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  async function copy() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await save(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      onError(new Error("Couldn't access the clipboard. Select the text and copy it manually."));
      return;
    }
    api.recordCopy(draft.id).catch(onError);
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      const response = await api.regenerateDraft(draft.id, { instruction: instruction.trim() || undefined });
      onReplace(response.draft);
    } catch (error) {
      onError(error);
    } finally {
      setRegenerating(false);
    }
  }

  function sendFeedback(nextRating: Rating, nextReasons: FeedbackReason[]) {
    setRating(nextRating);
    setReasons(nextReasons);
    api.sendFeedback(draft.id, { rating: nextRating, reasons: nextReasons }).catch(onError);
  }

  return (
    <Card className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="primary">AI-assisted draft</Badge>
        {draft.aiProvider === "mock" && <Badge tone="warning">Mock AI</Badge>}
        <span className="ml-auto text-[11px] text-muted-foreground" aria-live="polite">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "unsaved"
              ? "Unsaved"
              : draft.editedAt || text !== draft.generatedText
                ? "Edited · saved"
                : ""}
        </span>
      </div>

      <Textarea aria-label="Draft reply" rows={9} value={text} onChange={(event) => onEdit(event.target.value)} />

      {draft.notes && <p className="text-xs text-muted-foreground">Assistant note: {draft.notes}</p>}
      <IssueList issues={issues} />

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void copy()} disabled={blocked || !text.trim()}>
          {copied ? "Copied" : "Copy reply"}
        </Button>
        {draft.sourceUrl && (
          <a
            href={draft.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-surface-muted"
          >
            Open thread
          </a>
        )}
      </div>
      {copied && (
        <Alert tone="success">Copied. Review it once more, then paste and post it on Reddit yourself.</Alert>
      )}

      {canRegenerate && (
        <div className="flex gap-2">
          <Input
            aria-label="Adjust the next draft (optional)"
            placeholder="Adjust: e.g. shorter, more casual"
            value={instruction}
            maxLength={300}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <Button variant="secondary" onClick={() => void regenerate()} disabled={regenerating}>
            {regenerating ? <Spinner label="Regenerating" /> : "Regenerate"}
          </Button>
        </div>
      )}

      <div className="border-t border-border pt-3">
        <FeedbackControl rating={rating} reasons={reasons} onChange={sendFeedback} />
      </div>

      <a
        href={`${dashboardUrl}/w/${encodeURIComponent(draft.workspaceId)}/drafts/${encodeURIComponent(draft.id)}`}
        target="_blank"
        rel="noreferrer"
        className="block text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        View in dashboard (history, versions, team feedback)
      </a>
    </Card>
  );
}
