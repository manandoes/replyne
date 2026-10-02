"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { normalizeDomain } from "@shared/contracts";
import { validateDraft, type DraftRules } from "@shared/draft-validation";
import { Alert, Button, Card, Input, Label, Textarea } from "@shared/ui";
import { IssueList } from "@shared/ui/draft";
import { mutate } from "@/components/api-client";
import { ConfirmButton } from "@/components/confirm-button";
import { ListEditor } from "@/components/list-editor";

export type ProfileValues = {
  name: string;
  brandName: string;
  description: string;
  audience: string;
  products: string;
  tone: string;
  writingPreferences: string;
  facts: string[];
  prohibitedClaims: string[];
  linkPolicy: "NEVER" | "ALLOWED_DOMAINS";
  allowedLinkDomains: string[];
  disclosure: string;
};

export const EMPTY_PROFILE: ProfileValues = {
  name: "",
  brandName: "",
  description: "",
  audience: "",
  products: "",
  tone: "",
  writingPreferences: "",
  facts: [""],
  prohibitedClaims: [],
  linkPolicy: "NEVER",
  allowedLinkDomains: [],
  disclosure: "",
};

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function ProfileForm({
  workspaceId,
  profileId,
  initial,
  canManage,
  archived,
}: {
  workspaceId: string;
  profileId: string | null;
  initial: ProfileValues;
  canManage: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [sample, setSample] = useState("");

  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
    // Errors describe the submitted version; row-indexed ones would point at
    // the wrong row once rows are added or removed. The next save re-checks.
    setError(null);
    setFieldErrors({});
  };

  const rules: DraftRules = {
    brandName: values.brandName.trim(),
    facts: values.facts.map((fact) => fact.trim()).filter(Boolean),
    prohibitedClaims: values.prohibitedClaims.map((claim) => claim.trim()).filter(Boolean),
    linkPolicy: values.linkPolicy,
    allowedLinkDomains: values.allowedLinkDomains
      .map((domain) => normalizeDomain(domain))
      .filter((domain): domain is string => domain !== null),
    disclosure: values.disclosure.trim(),
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});
    const result = profileId
      ? await mutate(`/api/profiles/${profileId}`, "PATCH", values)
      : await mutate<{ profileId: string }>(`/api/workspaces/${workspaceId}/profiles`, "POST", values);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors);
      return;
    }
    if (!profileId) {
      router.push(`/w/${workspaceId}/profiles`);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const readOnly = !canManage;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset disabled={readOnly} className="space-y-4">
        <Section title="Identity" hint="How the profile appears here, and how the brand is named in replies.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="name" label="Profile name" hint="e.g. “Acme — support voice”" error={fieldErrors.name}>
              <Input id="name" value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={80} required />
            </Field>
            <Field id="brandName" label="Brand name" hint="Exactly as it should appear in a reply." error={fieldErrors.brandName}>
              <Input id="brandName" value={values.brandName} onChange={(e) => set("brandName", e.target.value)} maxLength={80} required />
            </Field>
          </div>
          <Field id="description" label="What the business does" error={fieldErrors.description}>
            <Textarea id="description" rows={3} value={values.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="audience" label="Audience" hint="Who you usually reply to." error={fieldErrors.audience}>
              <Textarea id="audience" rows={2} value={values.audience} onChange={(e) => set("audience", e.target.value)} maxLength={1000} />
            </Field>
            <Field id="products" label="Products and services" error={fieldErrors.products}>
              <Textarea id="products" rows={2} value={values.products} onChange={(e) => set("products", e.target.value)} maxLength={2000} />
            </Field>
          </div>
        </Section>

        <Section title="Voice" hint="Drafts follow this voice. Natural and clear — never tricks meant to seem human.">
          <Field id="tone" label="Tone" hint="e.g. “friendly, plain-spoken, no hype”" error={fieldErrors.tone}>
            <Input id="tone" value={values.tone} onChange={(e) => set("tone", e.target.value)} maxLength={300} />
          </Field>
          <Field id="writingPreferences" label="Writing preferences" hint="Words to use or avoid, formatting, sign-offs." error={fieldErrors.writingPreferences}>
            <Textarea
              id="writingPreferences"
              rows={3}
              value={values.writingPreferences}
              onChange={(e) => set("writingPreferences", e.target.value)}
              maxLength={2000}
            />
          </Field>
          <Field
            id="disclosure"
            label="Affiliation disclosure"
            hint="Added when a reply mentions the brand, e.g. “(I work on Acme)”. Being upfront about affiliation matters on Reddit."
            error={fieldErrors.disclosure}
          >
            <Input id="disclosure" value={values.disclosure} onChange={(e) => set("disclosure", e.target.value)} maxLength={200} />
          </Field>
        </Section>

        <Section
          title="Verified facts"
          hint="The only claims about your business a draft may make. Keep each one short, specific, and true."
        >
          <ListEditor
            id="facts"
            label="Facts"
            items={values.facts}
            onChange={(items) => set("facts", items)}
            placeholder="e.g. Acme has a free plan for up to 3 users."
            addLabel="Add a fact"
            maxItems={50}
            multiline
            disabled={readOnly}
            errors={fieldErrors}
          />
        </Section>

        <Section title="Guardrails" hint="Checked on every draft — blocking issues must be fixed before copying.">
          <ListEditor
            id="prohibitedClaims"
            label="Never say"
            hint="Phrases a reply must never contain."
            items={values.prohibitedClaims}
            onChange={(items) => set("prohibitedClaims", items)}
            placeholder="e.g. best tool on the market"
            addLabel="Add a phrase"
            maxItems={50}
            disabled={readOnly}
            errors={fieldErrors}
          />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Links in replies</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="linkPolicy"
                className="mt-1"
                checked={values.linkPolicy === "NEVER"}
                onChange={() => set("linkPolicy", "NEVER")}
              />
              <span>
                No links <span className="text-muted-foreground">— recommended; many communities treat links as promotion.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="linkPolicy"
                className="mt-1"
                checked={values.linkPolicy === "ALLOWED_DOMAINS"}
                onChange={() => set("linkPolicy", "ALLOWED_DOMAINS")}
              />
              <span>Only to these domains, when directly helpful</span>
            </label>
          </fieldset>
          {values.linkPolicy === "ALLOWED_DOMAINS" && (
            <ListEditor
              id="allowedLinkDomains"
              label="Allowed domains"
              hint="Subdomains are included (acme.io also allows docs.acme.io)."
              items={values.allowedLinkDomains}
              onChange={(items) => set("allowedLinkDomains", items)}
              placeholder="acme.io"
              addLabel="Add a domain"
              maxItems={20}
              disabled={readOnly}
              errors={fieldErrors}
            />
          )}
        </Section>
      </fieldset>

      <Section title="Test your guardrails" hint="Paste a sentence to see what these settings would flag. Nothing is saved or sent.">
        <Textarea
          aria-label="Sample reply to check"
          rows={3}
          value={sample}
          onChange={(event) => setSample(event.target.value)}
          placeholder="e.g. Acme is the best tool on the market — see https://example.com"
        />
        {sample.trim() &&
          (validateDraft(sample, rules).length === 0 ? (
            <p className="text-xs text-success">No issues with this text.</p>
          ) : (
            <IssueList issues={validateDraft(sample, rules)} />
          ))}
      </Section>

      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Saved. New drafts use these settings right away.</Alert>}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : profileId ? "Save changes" : "Create profile"}
          </Button>
          {profileId && !archived && (
            <ConfirmButton
              title="Archive this profile?"
              description="It disappears from the extension and new drafts. Draft history keeps it, and you can restore it anytime."
              confirmLabel="Archive"
              onConfirm={async () => {
                const result = await mutate(`/api/profiles/${profileId}/archive`, "POST", { archived: true });
                if (!result.ok) return result.error;
                router.push(`/w/${workspaceId}/profiles`);
                return null;
              }}
            >
              Archive
            </ConfirmButton>
          )}
          {profileId && archived && (
            <Button
              variant="secondary"
              onClick={async () => {
                const result = await mutate(`/api/profiles/${profileId}/archive`, "POST", { archived: false });
                if (!result.ok) setError(result.error);
                else router.refresh();
              }}
            >
              Restore
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
