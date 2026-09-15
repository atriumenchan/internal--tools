import { cn } from "@/lib/utils";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const control =
  "w-full rounded-[10px] border border-rule bg-input px-3 py-2.5 text-sm text-ink outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted hover:border-line-hover focus:border-blue focus:ring-2 focus:ring-blue/20 disabled:cursor-not-allowed disabled:text-disabled [color-scheme:dark]";

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
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm",
        variant === "primary" &&
          "bg-terracotta text-white shadow-sm hover:bg-terracotta-hover active:bg-terracotta-dark",
        variant === "ink" && "bg-elevated text-ink ring-1 ring-rule hover:border-line-hover hover:bg-cream",
        variant === "secondary" &&
          "border border-rule bg-elevated text-ink hover:border-blue hover:text-blue-soft",
        variant === "ghost" && "text-muted hover:bg-white/5 hover:text-ink",
        variant === "danger" && "border border-danger/30 bg-danger/15 text-danger hover:bg-danger/25",
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
    <select className={cn(control, className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-rule bg-cream p-5 shadow-card", className)}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warn" | "ok" | "danger" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
        tone === "neutral" && "bg-white/5 text-ink-soft ring-1 ring-rule",
        tone === "warn" && "bg-warning/10 text-warning ring-1 ring-warning/20",
        tone === "ok" && "bg-success/10 text-success ring-1 ring-success/20",
        tone === "danger" && "bg-danger/10 text-danger ring-1 ring-danger/20",
        tone === "info" && "bg-blue/10 text-blue-soft ring-1 ring-blue/20"
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        ) : null}
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-ink md:text-[40px]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[15px] text-ink-soft">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-blue-soft transition duration-200 hover:text-blue">
      {children}
    </Link>
  );
}

export function ErrorText({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={cn("text-sm text-danger", className)}>{children}</p>;
}

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-rule bg-surface px-4 py-10 text-center text-sm text-ink-soft",
        className
      )}
    >
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
    <div className={cn("inline-flex rounded-[10px] border border-rule bg-input p-1", className)}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition duration-200",
              active ? "bg-elevated text-ink shadow-sm" : "text-muted hover:text-ink"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
