"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Input, Label } from "@shared/ui";
import { mutate } from "./api-client";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await mutate<{ workspace: { id: string } }>("/api/workspaces", "POST", { name });
    if (!result.ok) {
      setPending(false);
      setError(result.fieldErrors.name ?? result.error);
      return;
    }
    router.push(`/w/${result.data.workspace.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Acme, or a client's name"
          maxLength={80}
          required
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Each workspace keeps its brand profiles, drafts, and members separate — agencies use one per client.
        </p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" disabled={pending || !name.trim()}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
