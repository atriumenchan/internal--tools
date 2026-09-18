import { cn } from "@/lib/utils";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const interactive =
  "transition-[background-color,border-color,box-shadow,color,transform,opacity] duration-150 ease-out";

const control =
  "w-full rounded-[10px] border border-rule bg-input px-3 py-2.5 text-[15px] font-normal text-ink outline-none placeholder:text-muted hover:border-line-hover focus:border-terracotta/50 focus:ring-2 focus:ring-terracotta/20 disabled:cursor-not-allowed disabled:text-disabled [color-scheme:dark] " +
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
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium cursor-pointer",
        interactive,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/50",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        size === "sm" ? "px-3 py-1.5 text-[13px]" : "px-4 py-2.5 text-[13px]",
        variant === "primary" &&
          "bg-terracotta text-white shadow-sm hover:bg-terracotta-hover hover:shadow-lift active:bg-terracotta-dark",
        variant === "ink" && "bg-elevated text-ink ring-1 ring-rule hover:bg-overlay",
        variant === "secondary" &&
          "border border-rule bg-elevated text-ink hover:bg-overlay hover:border-line-hover",
        variant === "ghost" && "text-ink-soft hover:bg-white/[0.06] hover:text-ink",
        variant === "danger" && "border border-danger/25 bg-danger/10 text-danger hover:bg-danger/20",
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
    <label className={cn("mb-1.5 block text-[12px] font-medium text-ink-soft", className)} {...props} />
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
      className={cn(
        "rounded-[10px] border border-rule bg-surface p-5",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_8px_24px_rgb(0_0_0/0.35)]",
        className
      )}
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
  tone?: "neutral" | "warn" | "ok" | "danger" | "info" | "accent";
  variant?: "soft" | "count";
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-[12px] font-medium leading-none",
        variant === "count" && "tabular min-w-[1.25rem] justify-center px-1.5",
        tone === "neutral" && "bg-white/[0.06] text-ink-soft",
        tone === "warn" && "bg-warning/15 text-warning",
        tone === "ok" && "bg-success/15 text-success",
        tone === "danger" && "bg-danger/15 text-danger",
        tone === "info" && "bg-blue/15 text-blue-soft",
        tone === "accent" && "bg-terracotta/15 text-terracotta"
      )}
    >
      {dot ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "warn" && "bg-warning",
            tone === "ok" && "bg-success",
            tone === "danger" && "bg-danger",
            tone === "info" && "bg-blue",
            tone === "accent" && "bg-terracotta",
            tone === "neutral" && "bg-ink-soft"
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
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-soft">
      <span
        className={cn(
          "grid h-4 w-4 place-items-center rounded-[6px] border",
          interactive,
          checked ? "border-terracotta bg-terracotta text-white" : "border-line-hover bg-input"
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
  eyebrow,
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
        {eyebrow ? <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.16em] text-muted">{eyebrow}</p> : null}
        {typeof title === "string" ? (
          <h1 className="text-[32px] font-semibold leading-[1.15] tracking-tight text-ink">{title}</h1>
        ) : (
          <div className="max-w-3xl">{title}</div>
        )}
        {description ? <p className="mt-2 max-w-2xl text-[15px] text-ink-soft">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("font-medium text-blue-soft hover:text-blue", interactive)}>
      {children}
    </Link>
  );
}

export function ErrorText({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={cn("text-[13px] text-danger", className)}>{children}</p>;
}

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[10px] border border-dashed border-rule bg-surface/50 px-4 py-10 text-center text-[13px] text-muted", className)}>
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
    <div className={cn("inline-flex flex-wrap rounded-[10px] bg-input p-1", className)}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "cursor-pointer rounded-[6px] px-3 py-1.5 text-[13px] font-medium",
              interactive,
              active ? "bg-elevated text-ink shadow-card" : "text-muted hover:text-ink hover:bg-white/[0.04]"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
