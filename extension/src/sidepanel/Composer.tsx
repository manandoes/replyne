import { useEffect, useState } from "react";
import {
  CAPTURED_TEXT_MAX_CHARS,
  LENGTH_LABELS,
  LENGTH_OPTIONS,
  TONE_LABELS,
  TONE_OPTIONS,
  type DraftDto,
  type DraftOptions,
  type MeResponse,
} from "@shared/contracts";
import { Alert, Badge, Button, Label, Select, Spinner, Textarea } from "@shared/ui";
import { ApiError, type ApiClient } from "../api";
import type { Capture } from "../capture";
import { getPrefs, onCapture, setPrefs, takeCapture, type Prefs } from "../storage";
import { DraftPanel } from "./DraftPanel";

type Props = { api: ApiClient; me: MeResponse; onUnauthorized: () => void };

export function Composer({ api, me, onUnauthorized }: Props) {
  const [prefs, setPrefsState] = useState<Prefs | null>(null);
  const [text, setText] = useState("");
  const [source, setSource] = useState<Capture["source"]>(null);
  const [includeSource, setIncludeSource] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [draft, setDraft] = useState<DraftDto | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyCapture = (capture: Capture) => {
    setText(capture.text);
    setSource(capture.source);
    setIncludeSource(capture.includeSource);
    setTruncated(capture.truncated);
    setDraft(null);
    setError(null);
  };

  useEffect(() => {
    void getPrefs().then(setPrefsState);
    void takeCapture().then((capture) => capture && applyCapture(capture));
    return onCapture(applyCapture);
  }, []);

  if (!prefs) {
    return <Spinner />;
  }

  const workspaces = me.workspaces;
  if (workspaces.length === 0) {
    return (
      <Alert title="No workspace yet">
        You aren&apos;t a member of any workspace. Ask a workspace admin to add {me.user.email}.
      </Alert>
    );
  }

  const workspace = workspaces.find((w) => w.id === prefs.workspaceId) ?? workspaces[0]!;
  const profile = workspace.brandProfiles.find((p) => p.id === prefs.profileId) ?? workspace.brandProfiles[0] ?? null;

  const updatePrefs = (next: Partial<Prefs>) => {
    const merged = { ...prefs, workspaceId: workspace.id, profileId: profile?.id ?? null, ...next };
    setPrefsState(merged);
    void setPrefs(merged);
  };
  const setOption = <K extends keyof DraftOptions>(key: K, value: DraftOptions[K]) =>
    updatePrefs({ options: { ...prefs.options, [key]: value } });

  const handleError = (caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 401) return onUnauthorized();
    setError(caught instanceof Error ? caught.message : "Something went wrong.");
  };

  async function generate() {
    if (!profile) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await api.generateDraft({
        workspaceId: workspace.id,
        brandProfileId: profile.id,
        capturedText: text,
        sourceUrl: includeSource && source ? source.url : null,
        options: prefs!.options,
        channel: "extension",
      });
      setDraft(response.draft);
    } catch (caught) {
      handleError(caught);
    } finally {
      setGenerating(false);
    }
  }

  const trimmed = text.trim();
  const tooLong = text.length > CAPTURED_TEXT_MAX_CHARS;
  const providerLabel = me.aiProvider === "gemini" ? "Google Gemini" : "a development mock (no AI provider configured)";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {workspaces.length > 1 && (
          <div className="col-span-2 space-y-1">
            <Label htmlFor="workspace">Workspace</Label>
            <Select
              id="workspace"
              value={workspace.id}
              onChange={(event) => updatePrefs({ workspaceId: event.target.value, profileId: null })}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="col-span-2 space-y-1">
          <Label htmlFor="profile">Brand profile</Label>
          {profile ? (
            <Select id="profile" value={profile.id} onChange={(event) => updatePrefs({ profileId: event.target.value })}>
              {workspace.brandProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          ) : (
            <Alert tone="warning">
              This workspace has no brand profiles yet.{" "}
              <a
                className="underline"
                href={`${me.dashboardUrl}/w/${encodeURIComponent(workspace.id)}/profiles`}
                target="_blank"
                rel="noreferrer"
              >
                {workspace.role === "OWNER" || workspace.role === "ADMIN" ? "Create one in the dashboard" : "Open the dashboard"}
              </a>
            </Alert>
          )}
        </div>
      </div>

      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="conversation">Conversation to reply to</Label>
          {trimmed && (
            <Button variant="ghost" size="sm" onClick={() => { setText(""); setSource(null); setDraft(null); }}>
              Clear
            </Button>
          )}
        </div>
        <Textarea
          id="conversation"
          rows={6}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Select text on a page, then click the toolbar icon or right-click → Draft a reply. Or paste the post or comment here."
        />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{truncated ? "Long selection was shortened." : ""}</span>
          <span className={tooLong ? "text-danger" : undefined}>
            {text.length.toLocaleString()} / {CAPTURED_TEXT_MAX_CHARS.toLocaleString()}
          </span>
        </div>
        {source && (
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={includeSource}
              onChange={(event) => setIncludeSource(event.target.checked)}
            />
            <span>
              Include the source link <span className="break-all text-foreground">{source.url}</span>
            </span>
          </label>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="tone">Tone</Label>
          <Select id="tone" value={prefs.options.tone} onChange={(e) => setOption("tone", e.target.value as DraftOptions["tone"])}>
            {TONE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {TONE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="length">Length</Label>
          <Select id="length" value={prefs.options.length} onChange={(e) => setOption("length", e.target.value as DraftOptions["length"])}>
            {LENGTH_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {LENGTH_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={prefs.options.brandMention === "never"}
            onChange={(event) => setOption("brandMention", event.target.checked ? "never" : "if_relevant")}
          />
          Don&apos;t mention {profile?.brandName ?? "the brand"} (otherwise only when relevant)
        </label>
      </div>

      {!workspace.canGenerate && (
        <Alert tone="warning">Your role in this workspace is read-only, so you can&apos;t generate drafts.</Alert>
      )}
      {me.aiProvider === "unconfigured" && (
        <Alert tone="warning">Drafting isn&apos;t set up on the server yet. Ask your admin to configure the AI provider.</Alert>
      )}

      <div className="space-y-2">
        <Button
          className="w-full"
          onClick={() => void generate()}
          disabled={!trimmed || tooLong || !profile || generating || !workspace.canGenerate}
        >
          {generating && <Spinner label="Drafting" />}
          {generating ? "Drafting…" : draft ? "Generate new draft" : "Generate response"}
        </Button>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Sends the text above{includeSource && source ? " and its link" : ""} plus the selected brand profile to the
          server, which drafts with {providerLabel}. Captured text is deleted after{" "}
          {me.capturedTextRetentionHours} hours. Nothing is posted to Reddit.
          {me.aiProvider === "mock" && (
            <>
              {" "}
              <Badge tone="warning">Mock AI</Badge>
            </>
          )}
        </p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {draft && profile && (
        <DraftPanel
          key={draft.id}
          api={api}
          draft={draft}
          rules={profile.rules}
          canRegenerate={workspace.canGenerate}
          dashboardUrl={me.dashboardUrl}
          onReplace={setDraft}
          onError={handleError}
        />
      )}
    </div>
  );
}
