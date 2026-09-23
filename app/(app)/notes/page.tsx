"use client";

import { useEffect, useState } from "react";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, PageHeader } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { formatWorkDate, kolkataTodayKey } from "@/lib/datetime";
import { addDaysKey } from "@/lib/own-attendance";
import { NOTE_PRESETS, newNoteItem, parseNoteItems, type DailyNoteItem } from "@/lib/daily-notes";

export default function DailyNotesPage() {
  const app = useAppState();
  const [day, setDay] = useState(kolkataTodayKey());
  const [items, setItems] = useState<DailyNoteItem[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!app) return;
    const supabase = createClient();
    setReady(false);
    setError(null);
    setSaved(null);
    void supabase
      .from("daily_notes")
      .select("items")
      .eq("work_date", day)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) {
          setError(
            err.message.includes("does not exist") || err.message.includes("schema cache")
              ? "Daily notes are not set up yet. Paste supabase/daily-notes.sql in the Supabase SQL editor."
              : err.message
          );
          setItems([]);
          setReady(true);
          return;
        }
        setItems(parseNoteItems(data?.items));
        setReady(true);
      });
  }, [app, day]);

  function addPreset(preset: string) {
    setItems((prev) => [...prev, newNoteItem(preset)]);
    setSaved(null);
  }

  function setText(id: string, text: string) {
    setItems((prev) => prev.map((row) => (row.id === id ? { ...row, text } : row)));
    setSaved(null);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((row) => row.id !== id));
    setSaved(null);
  }

  async function save() {
    if (!app) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const payload = items.map((row) => ({ id: row.id, preset: row.preset, text: row.text.trim() }));
    const { error: err } = await supabase.from("daily_notes").upsert(
      { user_id: app.userId, work_date: day, items: payload },
      { onConflict: "user_id,work_date" }
    );
    setBusy(false);
    if (err) {
      setError(
        err.message.includes("does not exist") || err.message.includes("schema cache")
          ? "Daily notes are not set up yet. Paste supabase/daily-notes.sql in the Supabase SQL editor."
          : err.message
      );
      return;
    }
    setSaved("Saved for " + formatWorkDate(day, "long"));
  }

  if (!app) return <PageFallback />;

  return (
    <div>
      <PageHeader
        title="Daily notes"
        description="Your private day log. Pick a numbered prompt, write a line, and save. Nobody else can see this."
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-sm border border-border text-muted hover:bg-surface-2 hover:text-ink"
          onClick={() => setDay((d) => addDaysKey(d, -1))}
          aria-label="Previous day"
        >
          <CaretLeft size={18} weight="light" />
        </button>
        <Field label="Day" className="min-w-[12rem]">
          <DatePicker value={day} onChange={(value) => value && setDay(value)} />
        </Field>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-sm border border-border text-muted hover:bg-surface-2 hover:text-ink"
          onClick={() => setDay((d) => addDaysKey(d, 1))}
          aria-label="Next day"
        >
          <CaretRight size={18} weight="light" />
        </button>
        {day !== kolkataTodayKey() ? (
          <Button type="button" variant="ghost" onClick={() => setDay(kolkataTodayKey())}>
            Today
          </Button>
        ) : null}
      </div>

      <p className="mb-4 font-display text-xl font-medium tracking-tight">{formatWorkDate(day, "long")}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {NOTE_PRESETS.map((preset) => (
          <Button key={preset.id} type="button" size="sm" variant="secondary" onClick={() => addPreset(preset.id)}>
            {preset.label}
          </Button>
        ))}
      </div>

      {!ready ? (
        <PageFallback />
      ) : (
        <ol className="space-y-3 rounded-md border border-border bg-surface p-4 shadow-card">
          {items.length === 0 ? (
            <li className="list-none py-8 text-center text-sm text-faint">
              Pick a numbered bullet above, then type. Saved notes stay on this day only.
            </li>
          ) : (
            items.map((item, index) => {
              const preset = NOTE_PRESETS.find((row) => row.id === item.preset);
              return (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="mt-2.5 w-6 shrink-0 text-right font-mono text-[13px] text-faint">{index + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-[11px] font-medium tracking-wide text-faint uppercase">{preset?.prompt || "Note"}</p>
                    <Input
                      value={item.text}
                      onChange={(e) => setText(item.id, e.target.value)}
                      placeholder={`${preset?.prompt || "Note"}…`}
                    />
                  </div>
                  <button
                    type="button"
                    className="mt-7 text-xs text-muted hover:text-coral"
                    onClick={() => removeItem(item.id)}
                  >
                    Remove
                  </button>
                </li>
              );
            })
          )}
        </ol>
      )}

      {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}
      {saved ? <p className="mt-4 text-sm text-sage">{saved}</p> : null}
      <div className="mt-5">
        <Button type="button" disabled={busy || !ready} onClick={() => void save()}>
          {busy ? "Saving…" : "Save this day"}
        </Button>
      </div>
    </div>
  );
}
