"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { DotsThree } from "@phosphor-icons/react/dist/ssr/DotsThree";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const MENU_WIDTH = 152;
const CONFIRM_WIDTH = 264;

export function ConfirmDelete({
  label = "Delete",
  title,
  description = "This cannot be undone.",
  confirmLabel = "Delete",
  onConfirm,
  extra,
  align = "right",
  className,
}: {
  label?: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  extra?: { label: string; icon?: ReactNode; onSelect: () => void }[];
  align?: "left" | "right";
  className?: string;
}) {
  const [mode, setMode] = useState<"closed" | "menu" | "confirm">("closed");
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const open = mode !== "closed";
  const width = mode === "confirm" ? CONFIRM_WIDTH : MENU_WIDTH;

  useEffect(() => {
    if (!open) return;
    function place() {
      const el = trigger.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const height = mode === "confirm" ? 172 : 44 + (extra?.length || 0) * 40;
      const left = align === "right" ? r.right - width : r.left;
      setBox({
        top: Math.min(r.bottom + 6, window.innerHeight - height - 8),
        left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      });
    }
    place();
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
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, mode, align, width, extra]);

  async function confirm() {
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
              "fixed z-[80] rounded-md border border-border bg-surface shadow-float",
              mode === "confirm" ? "border-coral/20 p-3.5" : "p-1"
            )}
            style={{ top: box.top, left: box.left, width }}
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
                    className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm font-medium text-ink transition duration-200 hover:bg-surface-2"
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMode("confirm")}
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm font-medium text-coral transition duration-200 hover:bg-coral-dim"
                >
                  <Trash size={18} weight="light" />
                  {label}
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{description}</p>
                <div className="mt-3 flex justify-end gap-2">
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
          setMode((m) => (m === "closed" ? "menu" : "closed"));
        }}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted transition duration-150 hover:bg-surface-2 hover:text-ink",
          open && "bg-surface-2 text-ink"
        )}
      >
        <DotsThree size={18} weight="light" />
      </button>
      {panel}
    </div>
  );
}
