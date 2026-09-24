"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { DotsThree } from "@phosphor-icons/react/dist/ssr/DotsThree";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export function ConfirmDelete({
  label = "Delete",
  title,
  description = "This cannot be undone.",
  confirmLabel = "Delete",
  onConfirm,
  extra,
  showDelete = true,
  align = "right",
  className,
}: {
  label?: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm?: () => Promise<void> | void;
  extra?: { label: string; icon?: ReactNode; onSelect: () => void }[];
  showDelete?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const hasMenu = Boolean(extra?.length);
  const [mode, setMode] = useState<"closed" | "menu" | "confirm">("closed");
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const open = mode !== "closed";

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const el = trigger.current;
      const panel = pop.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = panel?.offsetWidth || (mode === "confirm" ? 220 : 168);
      const h = panel?.offsetHeight || 48;
      let left = align === "right" ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      let top = r.bottom + 4;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
      setBox({ top, left });
    }
    place();
    const id = requestAnimationFrame(place);
    function onPointer(e: PointerEvent) {
      const node = e.target as Node;
      if (wrap.current?.contains(node) || pop.current?.contains(node)) return;
      setMode("closed");
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMode("closed");
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, mode, align]);

  async function confirm() {
    if (!onConfirm) {
      setMode("closed");
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
      setMode("closed");
    } finally {
      setBusy(false);
    }
  }

  const panel =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={pop}
            className={cn(
              "fixed z-[80] border border-border bg-surface shadow-card",
              "rounded-[9px]",
              mode === "confirm" ? "w-[13.5rem] p-2.5" : "min-w-[9.5rem] p-0.5"
            )}
            style={{ top: box.top, left: box.left }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {mode === "menu" ? (
              <div className="flex flex-col">
                {extra?.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setMode("closed");
                      item.onSelect();
                    }}
                    className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[13px] font-medium text-ink transition duration-150 hover:bg-surface-2"
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
                {showDelete ? (
                  <button
                    type="button"
                    onClick={() => setMode("confirm")}
                    className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[13px] font-medium text-coral transition duration-150 hover:bg-coral-dim"
                  >
                    <Trash size={15} weight="light" className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <p className="text-[13px] font-semibold leading-snug text-ink">{title}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-muted">{description}</p>
                <div className="mt-2.5 flex justify-end gap-1.5">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setMode("closed")} disabled={busy}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" variant="danger" onClick={() => void confirm()} disabled={busy}>
                    {busy ? "Deleting…" : confirmLabel}
                  </Button>
                </div>
              </>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={wrap} className={cn("relative shrink-0", className)}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMode((m) => {
            if (m !== "closed") return "closed";
            if (hasMenu) return "menu";
            return showDelete ? "confirm" : "closed";
          });
        }}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-muted transition duration-150 hover:bg-surface-2 hover:text-ink",
          open && "bg-surface-2 text-ink"
        )}
      >
        <DotsThree size={18} weight="light" />
      </button>
      {panel}
    </div>
  );
}
