"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const interactive =
  "transition-[background-color,border-color,box-shadow,color,transform,opacity] duration-150 ease-out motion-reduce:transition-none";

const control =
  "w-full rounded-[8px] border border-border bg-surface px-3 text-[13px] leading-5 font-normal text-ink outline-none placeholder:text-faint hover:border-border-strong focus:border-amber focus:shadow-[0_0_0_3px_var(--brand-soft)] focus:ring-0 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint " +
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
        "inline-flex items-center justify-center gap-2 rounded-[8px] font-medium cursor-pointer",
        interactive,
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber",
        "active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        size === "sm" ? "h-9 px-3 text-[13px]" : "h-[42px] px-4 text-[13px]",
        variant === "primary" && "border border-[var(--graphite)] bg-[var(--graphite)] text-[var(--text-inverse)] shadow-card hover:bg-[var(--graphite-hover)]",
        variant === "ink" && "border border-amber bg-amber text-white shadow-card hover:bg-[var(--brand-hover)]",
        variant === "secondary" && "border border-border-strong bg-surface text-ink shadow-card hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-ink",
        variant === "danger" && "border border-transparent bg-coral-dim text-coral hover:bg-coral hover:text-white",
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

function fitTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, onInput, value, rows = 1, ...props }, ref) {
    const inner = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
      fitTextarea(inner.current);
    }, [value]);
    return (
      <textarea
        ref={mergeRefs(inner, ref)}
        rows={rows}
        value={value}
        onInput={(e) => {
          fitTextarea(e.currentTarget);
          onInput?.(e);
        }}
        className={cn(control, "min-h-11 resize-none overflow-hidden py-2.5 leading-5", className)}
        {...props}
      />
    );
  }
);

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, "h-11 appearance-none bg-[length:12px] pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-[11px] leading-4 font-semibold tracking-[0.04em] text-muted uppercase", className)} {...props} />
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
      className={cn("rounded-[12px] border border-border bg-surface p-5 shadow-elevated", className)}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
  variant = "soft",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warn" | "ok" | "danger" | "info" | "accent" | "review";
  variant?: "soft" | "count";
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] px-1.5 py-0.5 text-[12px] leading-[18px] font-medium",
        variant === "count" && "tabular min-w-[1.25rem] justify-center",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "warn" && "bg-[var(--warning-soft)] text-[var(--warning)]",
        tone === "ok" && "bg-teal-dim text-teal",
        tone === "danger" && "bg-coral-dim text-coral",
        tone === "info" && "bg-[var(--info-soft)] text-[var(--info)]",
        tone === "accent" && "bg-amber-dim text-amber",
        tone === "review" && "bg-[var(--info-soft)] text-[var(--info)]"
      )}
    >
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
          <h1 className="text-[32px] leading-[38px] font-bold tracking-[-0.03em] text-ink">{title}</h1>
        ) : (
          <div className="max-w-3xl">{title}</div>
        )}
        {description ? <p className="mt-1 max-w-[40rem] text-[13px] leading-5 text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("text-amber underline decoration-amber/40 underline-offset-[3px] hover:decoration-amber", interactive)}>
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
    <div className={cn("rounded-[12px] border border-dashed border-border bg-surface px-6 py-10 text-center text-[13px] leading-5 text-muted shadow-card", className)}>
      {children}
    </div>
  );
}

export { Segmented } from "./overflow-strip";
