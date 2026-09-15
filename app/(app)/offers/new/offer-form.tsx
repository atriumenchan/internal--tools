"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import type { EmploymentType } from "@/lib/types";

export function OfferForm({
  createdBy,
  validityDays,
}: {
  createdBy: string;
  validityDays: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const payload = {
      created_by: createdBy,
      candidate_name: String(form.get("candidate_name") || "").trim(),
      candidate_email: String(form.get("candidate_email") || "").trim(),
      candidate_phone: String(form.get("candidate_phone") || "").trim() || null,
      position: String(form.get("position") || "").trim(),
      department: String(form.get("department") || "").trim() || null,
      employment_type: String(form.get("employment_type") || "full_time") as EmploymentType,
      location: String(form.get("location") || "").trim() || null,
      ctc_annual: Number(form.get("ctc_annual") || 0) || null,
      joining_date: String(form.get("joining_date") || "") || null,
      reporting_manager: String(form.get("reporting_manager") || "").trim() || null,
      probation_months: Number(form.get("probation_months") || 3),
      notice_period_days: Number(form.get("notice_period_days") || 30),
      custom_body: String(form.get("custom_body") || "").trim() || null,
      benefits: String(form.get("benefits") || "").trim() || null,
      status: "draft",
    };

    const { data, error: err } = await supabase.from("offer_letters").insert(payload).select("id").single();
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    await supabase.from("offer_events").insert({
      offer_id: data.id,
      event_type: "created",
      note: `Link will stay private for ${validityDays} days once opened for signature.`,
    });
    router.push(`/offers/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Candidate name">
          <Input name="candidate_name" required />
        </Field>
        <Field label="Candidate email">
          <Input name="candidate_email" type="email" required />
        </Field>
        <Field label="Phone">
          <Input name="candidate_phone" />
        </Field>
        <Field label="Position">
          <Input name="position" required />
        </Field>
        <Field label="Department">
          <Input name="department" />
        </Field>
        <Field label="Employment type">
          <Select name="employment_type" defaultValue="full_time">
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="intern">Internship</option>
          </Select>
        </Field>
        <Field label="Location">
          <Input name="location" />
        </Field>
        <Field label="Annual CTC (INR)">
          <Input name="ctc_annual" type="number" min={0} step={1000} />
        </Field>
        <Field label="Joining date">
          <DatePicker name="joining_date" placeholder="Joining date" />
        </Field>
        <Field label="Reporting manager">
          <Input name="reporting_manager" />
        </Field>
        <Field label="Probation (months)">
          <Input name="probation_months" type="number" defaultValue={3} />
        </Field>
        <Field label="Notice period (days)">
          <Input name="notice_period_days" type="number" defaultValue={30} />
        </Field>
      </div>
      <Field label="Letter body (optional)">
        <Textarea name="custom_body" rows={5} placeholder="Leave blank to use the standard wording." />
      </Field>
      <Field label="Benefits">
        <Textarea name="benefits" rows={4} placeholder="Health cover, equipment, learning stipend…" />
      </Field>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save as draft"}
        </Button>
        <p className="self-center text-xs text-ink-soft">Nothing is sent until they sign the link.</p>
      </div>
    </form>
  );
}
