"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { DatePicker } from "@/components/date-picker";
import { WEEKDAYS } from "@/lib/utils";
import { HANDBOOK_WEEKLY_OFFS } from "@/lib/handbook-calendar";
import type { CompanySettings, Holiday } from "@/lib/types";

export function SettingsForm({ settings, holidays }: { settings: CompanySettings; holidays: Holiday[] }) {
  const router = useRouter();
  const [offs, setOffs] = useState<number[]>(settings.weekly_offs ?? [0, 6]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveCompany(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("company_settings")
      .update({
        company_name: String(form.get("company_name") || ""),
        legal_name: String(form.get("legal_name") || ""),
        address: String(form.get("address") || ""),
        city: String(form.get("city") || ""),
        website: String(form.get("website") || ""),
        hr_email: String(form.get("hr_email") || ""),
        work_start: String(form.get("work_start") || "10:00"),
        work_end: String(form.get("work_end") || "19:00"),
        expected_hours: Number(form.get("expected_hours") || 9),
        late_grace_minutes: Number(form.get("late_grace_minutes") || 15),
        half_day_hours: Number(form.get("half_day_hours") || 4),
        weekly_offs: [...new Set([...HANDBOOK_WEEKLY_OFFS, ...offs])],
        offer_validity_days: Number(form.get("offer_validity_days") || 7),
        offer_footer: String(form.get("offer_footer") || ""),
        handbook_version: String(form.get("handbook_version") || "2.0").trim() || "2.0",
        anyone_can_create_spaces: form.get("anyone_can_create_spaces") === "on",
      })
      .eq("id", 1);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Saved company settings.");
    sessionStorage.removeItem("it-shell-v2");
    sessionStorage.removeItem("it-shell-v3");
    sessionStorage.removeItem("it-shell-v4");
    sessionStorage.removeItem("it-workspace-v1");
    router.refresh();
  }

  async function addHoliday(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const { error: err } = await supabase.from("holidays").insert({
      holiday_date: String(form.get("holiday_date")),
      name: String(form.get("name")),
    });
    if (err) {
      setError(err.message);
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  async function removeHoliday(id: string) {
    const supabase = createClient();
    await supabase.from("holidays").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={saveCompany} className="space-y-4 rounded-md border border-border bg-surface p-5 shadow-card">
        <h2 className="text-xl font-semibold">Company & letters</h2>
        <Field label="Company name">
          <Input name="company_name" defaultValue={settings.company_name} required />
        </Field>
        <Field label="Legal name">
          <Input name="legal_name" defaultValue={settings.legal_name} />
        </Field>
        <Field label="Address">
          <Input name="address" defaultValue={settings.address} />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={settings.city} />
        </Field>
        <Field label="Website">
          <Input name="website" defaultValue={settings.website} />
        </Field>
        <Field label="HR email">
          <Input name="hr_email" type="email" defaultValue={settings.hr_email} />
        </Field>
        <Field label="Offer link validity (days)">
          <Input name="offer_validity_days" type="number" defaultValue={settings.offer_validity_days} />
        </Field>
        <Field label="Letter footer">
          <Textarea name="offer_footer" rows={3} defaultValue={settings.offer_footer} />
        </Field>
        <h3 className="pt-2 text-lg font-semibold">Spaces & handbook</h3>
        <Field label="Current handbook version">
          <Input name="handbook_version" defaultValue={settings.handbook_version || "2.0"} />
        </Field>
        <p className="text-xs text-ink-soft">
          Bump this (for example 2.1) after you upload a new PDF. Everyone must sign again before they can use the app.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="anyone_can_create_spaces"
            defaultChecked={settings.anyone_can_create_spaces !== false}
            className="h-4 w-4 accent-terracotta"
          />
          Anyone who has signed the handbook can create Spaces
        </label>
        <h3 className="pt-2 text-lg font-semibold">Working hours</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <Input name="work_start" type="time" defaultValue={settings.work_start?.slice(0, 5)} />
          </Field>
          <Field label="End">
            <Input name="work_end" type="time" defaultValue={settings.work_end?.slice(0, 5)} />
          </Field>
          <Field label="Expected hours">
            <Input name="expected_hours" type="number" step="0.5" defaultValue={settings.expected_hours} />
          </Field>
          <Field label="Late grace (min)">
            <Input name="late_grace_minutes" type="number" defaultValue={settings.late_grace_minutes} />
          </Field>
          <Field label="Half-day below (hours)">
            <Input name="half_day_hours" type="number" step="0.5" defaultValue={settings.half_day_hours} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Weekly offs</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const on = offs.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  className={`rounded-sm px-3 py-1.5 text-sm font-medium transition duration-200 ${on ? "bg-teal-dim text-teal ring-1 ring-teal/25" : "border border-border text-muted hover:border-border-strong"}`}
                  onClick={() => {
                    if ((HANDBOOK_WEEKLY_OFFS as number[]).includes(day.value)) return;
                    setOffs((prev) =>
                      prev.includes(day.value) ? prev.filter((d) => d !== day.value) : [...prev, day.value]
                    );
                  }}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
        {error ? <p className="text-sm text-coral">{error}</p> : null}
        {message ? <p className="text-sm text-sage">{message}</p> : null}
        <Button type="submit">Save settings</Button>
      </form>

      <div className="rounded-md border border-border bg-surface p-5 shadow-card">
        <h2 className="font-display text-xl font-medium">Holidays</h2>
        <p className="mt-1 text-sm text-muted">
          Saturday and Sunday cannot be turned off. Fixed Noida 2026 holidays from the handbook count as holiday, not
          absence. Optional handbook holidays (Eid, Good Friday, Guru Nanak Jayanti) are chosen per person — add one
          here only if the whole office takes it.
        </p>
        <form onSubmit={addHoliday} className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2">
          <DatePicker name="holiday_date" required placeholder="Holiday date" />
          <Input name="name" placeholder="Name" required />
          <Button type="submit">Add</Button>
        </form>
        <ul className="mt-4 divide-y divide-border">
          {holidays.map((holiday) => (
            <li key={holiday.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {holiday.holiday_date} · {holiday.name}
              </span>
              <ConfirmDelete
                label="Delete holiday"
                title="Delete this holiday?"
                onConfirm={() => removeHoliday(holiday.id)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
