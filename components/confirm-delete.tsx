"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export function ConfirmDelete({
  label = "Delete",
  title,
  description = "This cannot be undone.",
  confirmLabel = "Delete",
  onConfirm,
  iconOnly = false,
  align = "right",
  className,
}: {
  label?: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  iconOnly?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  function place() {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 280;
    const left = align === "right" ? r.right - width : r.left;
    setBox({
      top: Math.min(r.bottom + 8, window.innerHeight - 196),
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    });
  }

  useEffect(() => {
    if (!open) return;
    place();
    function onPointer(e: PointerEvent) {
      const node = e.target as Node;
      if (wrap.current?.contains(node) || pop.current?.contains(node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function toggle(e: React.MouseEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    trigger.current = e.currentTarget;
    const r = e.currentTarget.getBoundingClientRect();
    const width = 280;
    const left = align === "right" ? r.right - width : r.left;
    setBox({
      top: Math.min(r.bottom + 8, window.innerHeight - 196),
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    });
    setOpen((v) => !v);
  }

  const popover =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={pop}
            className="fixed z-[80] w-[280px] rounded-xl border border-danger/20 bg-elevated p-3.5 shadow-elevated"
            style={{ top: box.top, left: box.left }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-danger/15 text-danger">
                <Trash2 size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{description}</p>
              </div>
            </div>
            <div className="mt-3.5 flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" size="sm" variant="danger" onClick={() => void confirm()} disabled={busy}>
                {busy ? "Deleting…" : confirmLabel}
              </Button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={wrap} className={cn("relative shrink-0", className)}>
      {iconOnly ? (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={toggle}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-danger/25 bg-danger/10 text-danger transition duration-200 hover:border-danger/40 hover:bg-danger/20"
        >
          <Trash2 size={14} />
        </button>
      ) : (
        <Button type="button" size="sm" variant="danger" onClick={toggle}>
          <Trash2 size={14} />
          {label}
        </Button>
      )}
      {popover}
    </div>
  );
}
