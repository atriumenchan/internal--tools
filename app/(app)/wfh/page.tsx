"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { isAdminUser } from "@/lib/admin";
import { displayName } from "@/lib/spaces";
import { formatWorkDate, kolkataTodayKey } from "@/lib/datetime";
import { pingWfhRequest } from "@/lib/ping-wfh";
import type { Profile, WfhRequest } from "@/lib/types";

const TONE: Record<WfhRequest["status"], "warn" | "ok" | "danger"> = {
  pending: "warn",
  approved: "ok",
  rejected: "danger",
};

export default function WfhPage() {
  const app = useAppState();
  const [rows, setRows] = useState<WfhRequest[] | null>(null);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [workDate, setWorkDate] = useState(kolkataTodayKey());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admin = app ? isAdminUser(app.profile) : false;

  async function load() {
    const supabase = createClient();
    const { data, error: err } = await supabase.from("wfh_requests").select("*").order("work_date", { ascending: false }).limit(80);
    if (err) {
      setError(
        err.message.includes("wfh_requests") || err.message.includes("schema cache")
          ? "Work from home needs a SQL patch. Paste supabase/wfh.sql in the Supabase SQL editor, then refresh."
          : err.message
      );
      setRows([]);
      return;
    }
    setRows((data ?? []) as WfhRequest[]);
    const ids = [...new Set((data ?? []).map((row) => row.user_id as string))];
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email, role").in("id", ids);
      setPeople(Object.fromEntries(((profiles ?? []) as Profile[]).map((p) => [p.id, p])));
    }
  }

  useEffect(() => {
    if (app) void load();
  }, [app]);

  const pending = useMemo(() => (rows ?? []).filter((r) => r.status === "pending"), [rows]);
  const mine = useMemo(() => (rows ?? []).filter((r) => r.user_id === app?.userId), [rows, app?.userId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!app) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("request_wfh", { p_work_date: workDate, p_note: note.trim() });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes("request_wfh") || err.message.includes("schema cache")
          ? "Work from home needs a SQL patch. Paste supabase/wfh.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      return;
    }
    setNote("");
    pingWfhRequest({ byName: displayName(app.profile), workDate });
    await load();
  }

  async function decide(id: string, approve: boolean) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("decide_wfh", { p_id: id, p_approve: approve });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    await load();
  }

  if (!app || rows === null) return <PageFallback />;

  return (
    <div>
      <PageHeader
        title="Work from home"
        description="Ask Ryan Ritabrata before the day. Approved days are not counted as absent when attendance is uploaded."
      />
      {error ? <p className="mb-4 text-sm text-coral">{error}</p> : null}

      <form onSubmit={(e) => void submit(e)} className="mb-8 max-w-xl space-y-3 rounded-md border border-border bg-surface p-4 shadow-card">
        <Field label="Date">
          <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
        </Field>
        <Field label="Note (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Why you need to be home" />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Ask to work from home"}
        </Button>
      </form>

      {admin && pending.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl font-medium tracking-tight">Waiting on you</h2>
          <ul className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{displayName(people[row.user_id])}</p>
                  <p className="text-[13px] text-muted">
                    {formatWorkDate(row.work_date, "long")}
                    {row.note ? ` · ${row.note}` : ""}
                  </p>
                </div>
                <Button type="button" size="sm" disabled={busy} onClick={() => void decide(row.id, true)}>
                  Approve
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void decide(row.id, false)}>
                  No
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-display text-xl font-medium tracking-tight">{admin ? "All requests" : "Your requests"}</h2>
        {(admin ? rows : mine).length === 0 ? (
          <p className="text-sm text-faint">None yet.</p>
        ) : (
          <ul className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
            {(admin ? rows : mine).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {admin ? displayName(people[row.user_id]) : formatWorkDate(row.work_date, "long")}
                  </p>
                  <p className="text-[13px] text-muted">
                    {admin ? formatWorkDate(row.work_date, "long") : null}
                    {row.note ? `${admin ? " · " : ""}${row.note}` : ""}
                  </p>
                </div>
                <Badge tone={TONE[row.status]}>{row.status === "pending" ? "Waiting" : row.status === "approved" ? "Approved" : "Not approved"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
