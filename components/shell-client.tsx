"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Select, cn } from "@shared/ui";

export type NavItem = { href: string; label: string; exact?: boolean };

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-surface-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function WorkspaceSwitcher({
  workspaces,
  currentId,
}: {
  workspaces: { id: string; name: string }[];
  currentId: string;
}) {
  const router = useRouter();
  return (
    <div className="space-y-1">
      <label htmlFor="workspace-switcher" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Workspace
      </label>
      <Select
        id="workspace-switcher"
        value={currentId}
        onChange={(event) =>
          router.push(event.target.value === "__new" ? "/workspaces/new" : `/w/${event.target.value}`)
        }
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
        <option value="__new">+ New workspace…</option>
      </Select>
    </div>
  );
}
