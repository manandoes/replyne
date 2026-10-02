import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Small, framework-neutral UI primitives shared by the dashboard (Next.js) and
 * the extension (Vite). Styling comes from the tokens in shared/theme.css.
 */

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "destructive";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "border border-border bg-surface text-foreground hover:bg-surface-muted",
  ghost: "text-foreground hover:bg-surface-muted",
  danger: "border border-border bg-surface text-danger hover:bg-danger-surface",
  destructive: "bg-danger text-primary-foreground hover:opacity-90",
};

/** Button styling for elements that aren't <button>, e.g. a link that acts as one. */
export function buttonClassName(variant: ButtonVariant = "primary", size: "sm" | "md" = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
    buttonVariants[variant],
    focusRing,
    className
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button type={type} className={buttonClassName(variant, size, className)} {...props} />;
}

const fieldBase = cn(
  "w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-60",
  focusRing
);

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, "h-9 px-2", className)} {...props} />;
}

export function Label({ className, ...props }: HTMLAttributes<HTMLLabelElement> & { htmlFor?: string }) {
  return <label className={cn("text-xs font-medium text-muted-foreground", className)} {...props} />;
}

type Tone = "neutral" | "primary" | "warning" | "danger" | "success";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  success: "bg-success-surface text-success",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium", badgeTones[tone])}>
      {children}
    </span>
  );
}

const alertTones: Record<Exclude<Tone, "primary">, string> = {
  neutral: "border-border bg-surface-muted text-foreground",
  warning: "border-warning/30 bg-warning-surface text-foreground",
  danger: "border-danger/30 bg-danger-surface text-foreground",
  success: "border-success/30 bg-success-surface text-foreground",
};

export function Alert({
  tone = "neutral",
  title,
  children,
  action,
}: {
  tone?: Exclude<Tone, "primary">;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-md border px-3 py-2.5 text-sm", alertTones[tone])}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && "mt-0.5", "text-muted-foreground")}>{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)} {...props} />;
}
