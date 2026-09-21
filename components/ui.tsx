import { cn } from "@/lib/utils";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const interactive =
  "transition-[background-color,border-color,box-shadow,color,transform,opacity] duration-150 ease-out motion-reduce:transition-none";

const control =
  "w-full rounded-sm border border-border-strong bg-surface px-3 py-2.5 text-[15px] font-normal text-ink outline-none placeholder:text-faint hover:border-amber-line focus:border-amber focus:shadow-[0_0_0_3px_var(--amber-dim)] focus:ring-0 disabled:cursor-not-allowed disabled:text-faint " +
  interactive;

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "ink";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm font-medium cursor-pointer",
        interactive,
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--amber-dim)] focus-visible:border-amber",
        "active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        size === "sm" ? "px-3 py-1.5 text-[13px]" : "px-4 py-2.5 text-[13px]",
        variant === "primary" &&
          "bg-[linear-gradient(135deg,var(--amber-soft),var(--amber))] text-white shadow-cta hover:brightness-[1.03]",
        variant === "ink" && "bg-surface-2 text-ink ring-1 ring-border-strong hover:bg-page",
        variant === "secondary" &&
          "border border-border-strong bg-surface-2 text-ink hover:border-amber-line",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-ink",
        variant === "danger" && "bg-coral text-white hover:brightness-[1.03]",
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-[6.5rem] resize-y leading-relaxed", className)} {...props} />;
  }
);

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, "appearance-none bg-[length:12px] pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-[12px] font-medium text-muted", className)} {...props} />
  );
}

export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md border border-border bg-surface p-5 shadow-card", className)}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
  variant = "soft",
  dot,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warn" | "ok" | "danger" | "info" | "accent" | "review";
  variant?: "soft" | "count";
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[12px] font-medium leading-none",
        variant === "count" && "tabular min-w-[1.25rem] justify-center px-1.5",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "warn" && "bg-amber-dim text-amber",
        tone === "ok" && "bg-teal-dim text-teal",
        tone === "danger" && "bg-coral-dim text-coral",
        tone === "info" && "bg-teal-dim text-teal",
        tone === "accent" && "bg-amber-dim text-amber",
        tone === "review" && "bg-violet-dim text-violet"
      )}
    >
      {dot ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "warn" && "bg-amber",
            tone === "ok" && "bg-teal",
            tone === "danger" && "bg-coral",
            tone === "info" && "bg-teal",
            tone === "accent" && "bg-amber",
            tone === "review" && "bg-violet",
            tone === "neutral" && "bg-faint"
          )}
        />
      ) : null}
      {children}
    </span>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
      <span
        className={cn(
          "grid h-4 w-4 place-items-center rounded-sm border",
          interactive,
          checked ? "border-amber bg-amber text-white" : "border-border-strong bg-surface"
        )}
      >
        {checked ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2 5.2 4.1 7.2 8 2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}

export function PageHeader({
  eyebrow: _eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1">
        {typeof title === "string" ? (
          <h1 className="font-display text-[32px] font-medium leading-[1.15] tracking-tight text-ink">{title}</h1>
        ) : (
          <div className="max-w-3xl">{title}</div>
        )}
        {description ? <p className="mt-2 max-w-2xl text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("font-medium text-teal hover:text-teal-soft", interactive)}>
      {children}
    </Link>
  );
}

export function ErrorText({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={cn("text-[13px] text-coral", className)}>{children}</p>;
}

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-md border border-dashed border-border bg-surface px-4 py-10 text-center text-[13px] text-faint", className)}>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap rounded-sm bg-surface-2 p-1", className)}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "cursor-pointer rounded-sm px-3 py-1.5 text-[13px] font-medium",
              interactive,
              active ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink hover:bg-surface/70"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
