import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function AccessNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** Links styled as a segmented control (e.g. period presets). */
export function SegmentedLinks({
  label,
  options,
}: {
  label: string;
  options: { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label} className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {options.map((option) => (
        <a
          key={option.href}
          href={option.href}
          aria-current={option.active ? "true" : undefined}
          className={
            option.active
              ? "rounded px-2.5 py-1 text-xs font-medium bg-surface-muted text-foreground"
              : "rounded px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          }
        >
          {option.label}
        </a>
      ))}
    </nav>
  );
}
