"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { cn } from "@/lib/utils";

function AnchoredPanel({
  anchor,
  width,
  children,
  onClose,
}: {
  anchor: HTMLElement;
  width?: number;
  children: ReactNode;
  onClose: () => void;
}) {
  const pop = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    function place() {
      const r = anchor.getBoundingClientRect();
      const w = Math.max(width ?? r.width, 168);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      const estimated = Math.min(pop.current?.offsetHeight || 200, window.innerHeight - 16);
      const below = r.bottom + 6;
      const top = below + estimated > window.innerHeight - 8 ? Math.max(8, r.top - estimated - 6) : below;
      setBox({ top, left, width: w });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, width]);

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      const node = e.target as Node;
      if (anchor.contains(node) || pop.current?.contains(node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  if (!box || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={pop}
      className="fixed z-[80] max-h-[min(20rem,70vh)] overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-float"
      style={{ top: box.top, left: box.left, width: box.width }}
    >
      {children}
    </div>,
    document.body
  );
}

export function OverflowStrip({
  className,
  moreLabel = "More",
  children,
}: {
  className?: string;
  moreLabel?: string;
  children: ReactNode;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [fits, setFits] = useState(true);

  useLayoutEffect(() => {
    const box = parent.current;
    const row = measure.current;
    if (!box || !row) return;
    const tick = () => setFits(row.scrollWidth <= box.clientWidth + 1);
    tick();
    const ro = new ResizeObserver(tick);
    ro.observe(box);
    ro.observe(row);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={parent} className={cn("relative min-w-0", className)}>
      <div
        ref={measure}
        className="pointer-events-none invisible absolute inset-x-0 top-0 flex items-center gap-2 whitespace-nowrap"
        aria-hidden
      >
        {children}
      </div>
      <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
        {children}
      </div>
      {!fits ? (
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-surface-2 from-35% to-transparent pl-10 pr-0.5 text-[11px] font-medium text-muted hover:text-ink"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {moreLabel}
        </button>
      ) : null}
      {open && parent.current ? (
        <AnchoredPanel anchor={parent.current} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-2 p-1.5 text-[13px] leading-snug text-ink">{children}</div>
        </AnchoredPanel>
      ) : null}
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
  const parent = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [fits, setFits] = useState(true);
  const active = options.find((option) => option.id === value);

  useLayoutEffect(() => {
    const box = parent.current;
    const row = measure.current;
    if (!box || !row) return;
    const tick = () => setFits(row.scrollWidth <= box.clientWidth + 1);
    tick();
    const ro = new ResizeObserver(tick);
    ro.observe(box);
    ro.observe(row);
    return () => ro.disconnect();
  }, [options, value]);

  function pick(id: T) {
    onChange(id);
    setOpen(false);
  }

  const buttons = options.map((option) => {
    const selected = option.id === value;
    return (
      <button
        key={option.id}
        type="button"
        onClick={() => pick(option.id)}
        className={cn(
          "cursor-pointer rounded-sm px-3 py-1.5 text-[13px] font-medium whitespace-nowrap",
          selected ? "bg-surface text-ink shadow-card" : "text-muted hover:bg-surface/70 hover:text-ink"
        )}
      >
        {option.label}
      </button>
    );
  });

  return (
    <div ref={parent} className={cn("relative min-w-0 max-w-full", className)}>
      <div
        ref={measure}
        className="pointer-events-none invisible absolute flex items-center rounded-sm bg-surface-2 p-1"
        aria-hidden
      >
        {buttons}
      </div>
      <div className="inline-flex max-w-full min-w-0 items-center overflow-hidden rounded-sm bg-surface-2 p-1">
        {fits ? (
          buttons
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="min-w-0 truncate rounded-sm bg-surface px-3 py-1.5 text-[13px] font-medium text-ink shadow-card"
            >
              {active?.label}
            </button>
            <button
              type="button"
              aria-expanded={open}
              aria-label="More options"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-muted hover:bg-surface hover:text-ink"
              onClick={() => setOpen((v) => !v)}
            >
              <CaretDown size={14} weight="light" />
            </button>
          </>
        )}
      </div>
      {open && !fits && parent.current ? (
        <AnchoredPanel anchor={parent.current} onClose={() => setOpen(false)}>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => pick(option.id)}
              className={cn(
                "flex w-full rounded-sm px-3 py-2 text-left text-[13px] font-medium",
                option.id === value ? "bg-amber-dim text-amber" : "text-ink hover:bg-surface-2"
              )}
            >
              {option.label}
            </button>
          ))}
        </AnchoredPanel>
      ) : null}
    </div>
  );
}
