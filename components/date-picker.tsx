"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { formatWorkDate, kolkataTodayKey } from "@/lib/datetime";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function parseKey(value: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").slice(0, 10));
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function toKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function selectedFrom(value: string | null | undefined) {
  const parts = parseKey(value);
  return parts ? toKey(parts.year, parts.month, parts.day) : null;
}

function shiftDay(key: string, days: number) {
  const parts = parseKey(key);
  if (!parts) return key;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days)).toISOString().slice(0, 10);
}

function monthCells(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = (first.getUTCDay() + 6) % 7;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = Array.from({ length: start }, () => null);
  for (let d = 1; d <= lastDay; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DatePicker({
  value,
  onChange,
  name,
  placeholder = "Pick a date",
  required,
  className,
}: {
  value?: string | null;
  onChange?: (value: string | null) => void;
  name?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const controlled = value !== undefined;
  const [draft, setDraft] = useState<string | null>(null);
  const selectedKey = selectedFrom(controlled ? value : draft);
  const today = kolkataTodayKey();
  const initial = parseKey(selectedKey || today) ?? parseKey(today)!;
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form || controlled) return;
    function onReset() {
      setDraft(null);
    }
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [controlled]);

  useEffect(() => {
    if (!open) return;
    const shown = parseKey(selectedKey || today);
    if (shown) {
      setViewYear(shown.year);
      setViewMonth(shown.month);
    }
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, selectedKey, today]);

  const cells = useMemo(() => monthCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const heading = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  function pick(key: string | null) {
    if (!controlled) setDraft(key);
    onChange?.(key);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(viewYear, viewMonth - 1 + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth() + 1);
  }

  return (
    <div ref={root} className={cn("relative min-w-[12rem]", className)}>
      {name ? <input type="hidden" name={name} value={selectedKey || ""} required={required} /> : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-sm border border-border-strong bg-surface px-3 py-2.5 text-left text-sm outline-none transition duration-200 hover:border-amber-line focus:border-amber focus:shadow-[0_0_0_3px_var(--amber-dim)]"
      >
        <span className={selectedKey ? "text-ink" : "text-muted"}>
          {selectedKey ? formatWorkDate(selectedKey, "long") : placeholder}
        </span>
        <CalendarBlank size={18} weight="light" className="shrink-0 text-muted" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-2 w-[17.5rem] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface p-3 shadow-float">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous month" className="rounded-sm p-1 text-muted hover:bg-surface-2 hover:text-ink" onClick={() => shiftMonth(-1)}>
              <CaretLeft size={18} weight="light" />
            </button>
            <p className="text-sm font-medium capitalize">{heading}</p>
            <button type="button" aria-label="Next month" className="rounded-sm p-1 text-muted hover:bg-surface-2 hover:text-ink" onClick={() => shiftMonth(1)}>
              <CaretRight size={18} weight="light" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-faint">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <span key={`e-${i}`} />;
              const key = toKey(viewYear, viewMonth, day);
              const isToday = key === today;
              const isSelected = key === selectedKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pick(key)}
                  className={cn(
                    "h-8 rounded-sm text-sm",
                    isSelected && "bg-[linear-gradient(135deg,var(--amber-soft),var(--amber))] text-white",
                    !isSelected && isToday && "ring-1 ring-teal/50 text-ink",
                    !isSelected && !isToday && "text-muted hover:bg-surface-2 hover:text-ink"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
            <button type="button" className="rounded-sm px-2 py-1 text-muted hover:bg-surface-2 hover:text-ink" onClick={() => pick(today)}>
              Today
            </button>
            <button
              type="button"
              className="rounded-sm px-2 py-1 text-muted hover:bg-surface-2 hover:text-ink"
              onClick={() => pick(shiftDay(today, 1))}
            >
              Tomorrow
            </button>
            {!required ? (
              <button type="button" className="ml-auto rounded-sm px-2 py-1 text-muted hover:bg-surface-2 hover:text-ink" onClick={() => pick(null)}>
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
