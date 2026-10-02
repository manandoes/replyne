"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Input, Label } from "@shared/ui";
import { mutate } from "@/components/api-client";
import { ConfirmButton } from "@/components/confirm-button";

export function WorkspaceSettings({
  workspaceId,
  name,
  userId,
  canRename,
  canDelete,
  soleOwner,
}: {
  workspaceId: string;
  name: string;
  userId: string;
  canRename: boolean;
  canDelete: boolean;
  soleOwner: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function rename(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await mutate(`/api/workspaces/${workspaceId}`, "PATCH", { name: value });
    setPending(false);
    if (!result.ok) return setMessage({ tone: "danger", text: result.fieldErrors.name ?? result.error });
    setMessage({ tone: "success", text: "Workspace renamed." });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Workspace name</h2>
        <form onSubmit={rename} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={80}
              disabled={!canRename}
              required
            />
          </div>
          {canRename && (
            <Button type="submit" disabled={pending || value.trim() === name}>
              {pending ? "Saving…" : "Save"}
            </Button>
          )}
        </form>
        {!canRename && <p className="mt-2 text-xs text-muted-foreground">Only owners and admins can rename the workspace.</p>}
        {message && (
          <div className="mt-3">
            <Alert tone={message.tone}>{message.text}</Alert>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Leave workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {soleOwner
            ? "You're the only owner. Make someone else an owner first, or delete the workspace."
            : "You'll lose access right away. Drafts you created stay in the workspace."}
        </p>
        {!soleOwner && (
          <div className="mt-3">
            <ConfirmButton
              title="Leave this workspace?"
              description="You'll need a new invite to come back."
              confirmLabel="Leave workspace"
              onConfirm={async () => {
                const result = await mutate(`/api/workspaces/${workspaceId}/members/${userId}`, "DELETE");
                if (!result.ok) return result.error;
                router.push("/");
                return null;
              }}
            >
              Leave workspace
            </ConfirmButton>
          </div>
        )}
      </Card>

      {canDelete && (
        <Card className="border-danger/40 p-5">
          <h2 className="text-sm font-semibold text-danger">Delete workspace</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Permanently deletes every brand profile, draft, captured text, rating, invite, and audit entry in this
            workspace. This can&apos;t be undone.
          </p>
          <div className="mt-3">
            <ConfirmButton
              title="Delete this workspace permanently?"
              description={
                <>
                  <p>Everything in “{name}” is deleted for all members, immediately.</p>
                  <p>Type the workspace name to confirm.</p>
                </>
              }
              confirmText={name}
              confirmLabel="Delete workspace"
              onConfirm={async (typed) => {
                const result = await mutate(`/api/workspaces/${workspaceId}`, "DELETE", { confirmName: typed });
                if (!result.ok) return result.error;
                router.push("/");
                return null;
              }}
            >
              Delete workspace…
            </ConfirmButton>
          </div>
        </Card>
      )}
    </div>
  );
}
