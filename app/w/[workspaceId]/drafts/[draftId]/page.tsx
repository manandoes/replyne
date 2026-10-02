import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FEEDBACK_REASON_LABELS, TONE_LABELS, LENGTH_LABELS, type DraftOptions, type FeedbackReason } from "@shared/contracts";
import type { ValidationIssue } from "@shared/draft-validation";
import { describeSourceUrl } from "@shared/reddit-url";
import { Badge, Card } from "@shared/ui";
import { formatDateTime, formatRelative, formatUntil } from "@/components/format";
import { rulesFromProfile } from "@/lib/drafts/service";
import { capturedTextAvailable, getDraftDetail } from "@/lib/drafts/data";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";
import { DeleteSourceButton, DraftWorkbench } from "./draft-workbench";

export const metadata: Metadata = { title: "Draft" };

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; draftId: string }>;
}) {
  const { workspaceId, draftId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/drafts/${draftId}`);
  const draft = await getDraftDetail(actor, draftId);
  if (!draft) notFound();

  const now = new Date();
  const base = `/w/${workspaceId}/drafts`;
  const isAuthor = draft.createdById === actor.userId;
  const canGenerate = can(actor.role, "draft.generate");
  const sourceAvailable = capturedTextAvailable(draft, now) && draft.capturedText !== null;
  const options = draft.options as DraftOptions & { instruction?: string };
  const source = describeSourceUrl(draft.sourceUrl);
  const mine = draft.feedback.find((entry) => entry.userId === actor.userId);
  const others = draft.feedback.filter((entry) => entry.userId !== actor.userId);

  const regenerateBlockedReason = !canGenerate
    ? "Your role can't generate drafts."
    : draft.brandProfile.archivedAt
      ? "This draft's brand profile is archived."
      : !sourceAvailable
        ? "The source text was removed under the retention policy — capture the conversation again to redraft."
        : null;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
        <Link href={base} className="hover:text-foreground">
          Drafts
        </Link>
        <span aria-hidden> / </span>
        <span className="text-foreground">Draft</span>
      </nav>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Draft</h1>
        <Badge tone="primary">AI-assisted</Badge>
        {draft.aiProvider === "mock" && <Badge tone="warning">Mock AI</Badge>}
        {draft.revised && <Badge>Auto-revised</Badge>}
        <span className="text-sm text-muted-foreground">
          by {draft.createdBy?.name ?? "a former member"} ·{" "}
          <time dateTime={draft.createdAt.toISOString()} title={formatDateTime(draft.createdAt)}>
            {formatRelative(draft.createdAt, now)}
          </time>{" "}
          · {draft.channel === "EXTENSION" ? "from the extension" : "from the dashboard"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card className="p-5">
            <DraftWorkbench
              draft={{ id: draft.id, text: draft.currentText, issues: draft.validationIssues as ValidationIssue[] }}
              rules={rulesFromProfile(draft.brandProfile)}
              draftsHref={base}
              canEdit={isAuthor && canGenerate}
              canRegenerate={regenerateBlockedReason === null}
              regenerateBlockedReason={regenerateBlockedReason}
              canRate={can(actor.role, "draft.feedback")}
              canDelete={isAuthor || can(actor.role, "draft.delete_any")}
              myFeedback={
                mine
                  ? { rating: mine.rating === "UP" ? "up" : "down", reasons: mine.reasons as FeedbackReason[] }
                  : null
              }
            />
          </Card>

          {draft.notes && (
            <Card className="p-4 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Assistant note</p>
              <p className="mt-1">{draft.notes}</p>
            </Card>
          )}

          {draft.generatedText !== draft.currentText && (
            <details className="rounded-lg border border-border bg-surface p-4 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Original AI draft (before edits)
              </summary>
              <p className="mt-2 whitespace-pre-wrap">{draft.generatedText}</p>
            </details>
          )}

          <Card className="p-4">
            <h2 className="text-sm font-medium">Team feedback</h2>
            {others.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No one else has rated this draft.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {others.map((entry) => (
                  <li key={entry.id} className="py-2 text-sm">
                    <span className="font-medium">{entry.user.name}</span>{" "}
                    <span className="text-muted-foreground">rated it</span>{" "}
                    <Badge tone={entry.rating === "UP" ? "primary" : "warning"}>
                      {entry.rating === "UP" ? "Helpful" : "Not helpful"}
                    </Badge>
                    {entry.reasons.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · {entry.reasons.map((reason) => FEEDBACK_REASON_LABELS[reason as FeedbackReason] ?? reason).join(", ")}
                      </span>
                    )}
                    {entry.note && <p className="mt-0.5 text-xs text-muted-foreground">“{entry.note}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="space-y-3 p-4 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Brand profile</p>
              <Link href={`/w/${workspaceId}/profiles/${draft.brandProfile.id}`} className="hover:underline">
                {draft.brandProfile.name}
              </Link>
              {draft.brandProfile.archivedAt && <span className="text-xs text-muted-foreground"> (archived)</span>}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Options</p>
              <p>
                {TONE_LABELS[options.tone] ?? options.tone} · {LENGTH_LABELS[options.length] ?? options.length} ·{" "}
                {options.brandMention === "never" ? "no brand mention" : "brand only if relevant"}
              </p>
              {options.instruction && <p className="text-xs text-muted-foreground">Instruction: “{options.instruction}”</p>}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Copied</p>
              <p>{draft.copyCount === 0 ? "Not yet" : `${draft.copyCount} ${draft.copyCount === 1 ? "time" : "times"}`}</p>
            </div>
          </Card>

          <Card className="space-y-2 p-4 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Source conversation</p>
            {source ? (
              <p>
                <a href={source.url} target="_blank" rel="noreferrer" className="break-all hover:underline">
                  {source.isReddit && source.subreddit ? `r/${source.subreddit} on Reddit` : source.host}
                </a>
              </p>
            ) : (
              <p className="text-muted-foreground">No link was included.</p>
            )}
            {sourceAvailable ? (
              <>
                <blockquote className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-surface-muted p-2 text-xs">
                  {draft.capturedText}
                </blockquote>
                <p className="text-xs text-muted-foreground">
                  {source?.isReddit ? "Captured from Reddit. " : ""}Deleted automatically {formatUntil(draft.capturedTextExpiresAt, now)}.
                </p>
                {(isAuthor || can(actor.role, "draft.delete_any")) && <DeleteSourceButton draftId={draft.id} />}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Source text removed{draft.capturedTextPurgedAt ? ` ${formatRelative(draft.capturedTextPurgedAt, now)}` : ""} under
                the retention policy. The draft and its link remain.
              </p>
            )}
          </Card>

          {(draft.regeneratedFrom || draft.regenerations.length > 0) && (
            <Card className="p-4 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Versions</p>
              <ul className="mt-1 space-y-1">
                {draft.regeneratedFrom && (
                  <li>
                    <Link href={`${base}/${draft.regeneratedFrom.id}`} className="hover:underline">
                      ← Earlier version
                    </Link>{" "}
                    <span className="text-xs text-muted-foreground">{formatRelative(draft.regeneratedFrom.createdAt, now)}</span>
                  </li>
                )}
                {draft.regenerations.map((version) => (
                  <li key={version.id}>
                    <Link href={`${base}/${version.id}`} className="hover:underline">
                      Newer version →
                    </Link>{" "}
                    <span className="text-xs text-muted-foreground">{formatRelative(version.createdAt, now)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
