import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

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
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
        variant === "primary" && "bg-terracotta text-white hover:bg-terracotta-dark",
        variant === "ink" && "bg-ink text-paper hover:bg-ink-soft",
        variant === "secondary" && "border border-rule bg-cream text-ink hover:bg-white/5",
        variant === "ghost" && "text-ink-soft hover:bg-white/5",
        variant === "danger" && "bg-red-800 text-white hover:bg-red-900",
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-rule bg-paper px-3 py-2.5 text-sm text-ink outline-none ring-terracotta/40 placeholder:text-ink-soft/60 focus:ring-2",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-rule bg-paper px-3 py-2.5 text-sm text-ink outline-none ring-terracotta/40 placeholder:text-ink-soft/60 focus:ring-2",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-xl border border-rule bg-paper px-3 py-2.5 text-sm text-ink outline-none ring-terracotta/40 focus:ring-2",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-soft", className)} {...props} />;
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
  return <div className={cn("rounded-2xl border border-rule bg-cream p-5", className)} {...props} />;
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
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-rule/70 text-ink-soft",
        tone === "warn" && "bg-amber-950 text-amber-200",
        tone === "ok" && "bg-sage-soft text-sage",
        tone === "danger" && "bg-red-950 text-red-200",
        tone === "info" && "bg-orange-950 text-orange-200"
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
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-terracotta">{eyebrow}</p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-ink-soft">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-terracotta hover:underline">
      {children}
    </Link>
  );
}
