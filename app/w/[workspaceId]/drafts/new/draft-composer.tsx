"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  CAPTURED_TEXT_MAX_CHARS,
  LENGTH_LABELS,
  LENGTH_OPTIONS,
  TONE_LABELS,
  TONE_OPTIONS,
  type DraftOptions,
  type DraftResponse,
} from "@shared/contracts";
import { Alert, Button, Input, Label, Select, Spinner, Textarea } from "@shared/ui";
import { mutate } from "@/components/api-client";

type Profile = { id: string; name: string; brandName: string };

export function DraftComposer({
  workspaceId,
  profiles,
  providerLabel,
  retentionHours,
}: {
  workspaceId: string;
  profiles: Profile[];
  providerLabel: string;
  retentionHours: number;
}) {
  const router = useRouter();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [text, setText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [options, setOptions] = useState<DraftOptions>({ tone: "profile", length: "medium", brandMention: "if_relevant" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const profile = profiles.find((p) => p.id === profileId);
  const tooLong = text.length > CAPTURED_TEXT_MAX_CHARS;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});
    const result = await mutate<DraftResponse>("/api/drafts", "POST", {
      workspaceId,
      brandProfileId: profileId,
      capturedText: text,
      sourceUrl: sourceUrl.trim() || null,
      options,
      channel: "dashboard",
    });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      setFieldErrors(result.fieldErrors);
      return;
    }
    router.push(`/w/${workspaceId}/drafts/${result.data.draft.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="profile">Brand profile</Label>
        <Select id="profile" value={profileId} onChange={(event) => setProfileId(event.target.value)} className="max-w-sm">
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="conversation">Conversation to reply to</Label>
        <Textarea
          id="conversation"
          rows={8}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste the post or comment you want to reply to."
          aria-invalid={fieldErrors.capturedText ? true : undefined}
          required
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="text-danger">{fieldErrors.capturedText}</span>
          <span className={tooLong ? "text-danger" : undefined}>
            {text.length.toLocaleString()} / {CAPTURED_TEXT_MAX_CHARS.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="source">Link to the conversation (optional)</Label>
        <Input
          id="source"
          type="url"
          inputMode="url"
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          placeholder="https://www.reddit.com/r/…"
          aria-invalid={fieldErrors.sourceUrl ? true : undefined}
          className="max-w-xl"
        />
        {fieldErrors.sourceUrl && <p className="text-xs text-danger">{fieldErrors.sourceUrl}</p>}
        <p className="text-xs text-muted-foreground">Stored as a reference only. It is never fetched.</p>
      </div>

      <div className="grid max-w-xl grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tone">Tone</Label>
          <Select
            id="tone"
            value={options.tone}
            onChange={(event) => setOptions({ ...options, tone: event.target.value as DraftOptions["tone"] })}
          >
            {TONE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {TONE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="length">Length</Label>
          <Select
            id="length"
            value={options.length}
            onChange={(event) => setOptions({ ...options, length: event.target.value as DraftOptions["length"] })}
          >
            {LENGTH_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {LENGTH_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={options.brandMention === "never"}
            onChange={(event) =>
              setOptions({ ...options, brandMention: event.target.checked ? "never" : "if_relevant" })
            }
          />
          Don&apos;t mention {profile?.brandName ?? "the brand"} (otherwise only when relevant)
        </label>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="space-y-2">
        <Button type="submit" disabled={pending || !text.trim() || tooLong || !profileId}>
          {pending && <Spinner label="Drafting" />}
          {pending ? "Drafting…" : "Generate response"}
        </Button>
        <p className="max-w-xl text-xs text-muted-foreground">
          Sends the text{sourceUrl.trim() ? " and link" : ""} above plus the selected brand profile to {providerLabel} to
          draft a reply. Captured text is deleted after {retentionHours} hours. Nothing is posted to Reddit — you review
          and post replies yourself.
        </p>
      </div>
    </form>
  );
}
