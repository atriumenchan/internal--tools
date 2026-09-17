"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, ErrorText, Field, PageHeader, Select, Textarea } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { displayName } from "@/lib/spaces";
import { isManagerUser } from "@/lib/roles";
import {
  applyLeaveDecision,
  canDecideLeave,
  canSubmitLeave,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  leaveDayCount,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveType,
} from "@/lib/leave";
import type { Profile } from "@/lib/types";

const emptyBalance = (userId: string): LeaveBalance => ({
  user_id: userId,
  casual_days: 12,
  sick_days: 6,
  earned_days: 15,
  unpaid_used: 0,
});

export default function LeavePage() {
  const app = useAppState();
  const manager = app ? isManagerUser(app.profile) : false;
  const [mine, setMine] = useState<LeaveRequest[] | null>(null);
  const [queue, setQueue] = useState<LeaveRequest[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [type, setType] = useState<LeaveType>("casual");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!app) return;
    const supabase = createClient();
    void (async () => {
      const [balRes, mineRes, peopleRes, queueRes] = await Promise.all([
        supabase.from("leave_balances").select("*").eq("user_id", app.userId).maybeSingle(),
        supabase.from("leave_requests").select("*").eq("user_id", app.userId).order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, email, full_name, role"),
        manager
          ? supabase.from("leave_requests").select("*").eq("status", "pending").order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (balRes.error || mineRes.error) {
        setError(
          "Leave is not set up yet. Paste supabase/workspace-lite.sql in the Supabase SQL editor, then refresh."
        );
        setMine([]);
        return;
      }
      setBalance((balRes.data as LeaveBalance | null) ?? emptyBalance(app.userId));
      setMine((mineRes.data ?? []) as LeaveRequest[]);
      setPeople(Object.fromEntries(((peopleRes.data ?? []) as Profile[]).map((p) => [p.id, p])));
      setQueue(((queueRes.data ?? []) as LeaveRequest[]).filter((row) => row.user_id !== app.userId));
    })();
  }, [app, manager]);

  const pendingDays = useMemo(
    () =>
      (mine ?? [])
        .filter((row) => row.status === "pending" && row.leave_type === type)
        .reduce((sum, row) => sum + Number(row.days), 0),
    [mine, type]
  );

  async function ensureBalance() {
    if (!app || !balance) return balance;
    const supabase = createClient();
    await supabase.from("leave_balances").upsert(balance);
    return balance;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!app || !balance) return;
    const check = canSubmitLeave({ start, end, type, balance, pendingDays });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    await ensureBalance();
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("leave_requests")
      .insert({
        user_id: app.userId,
        leave_type: type,
        start_date: start,
        end_date: end,
        days: check.days,
        reason: reason.trim() || null,
        status: "pending",
      })
      .select("*")
      .single();
    setBusy(false);
    if (err || !data) {
      setError(err?.message || "Could not submit leave.");
      return;
    }
    setMine((prev) => [data as LeaveRequest, ...(prev ?? [])]);
    setReason("");
  }

  async function decide(row: LeaveRequest, decision: "approved" | "rejected") {
    if (!app) return;
    const gate = canDecideLeave({ applicantId: row.user_id, actorId: app.userId, actorIsManager: manager });
    if (!gate.ok) {
      setError(gate.error);
      return;
    }
    const supabase = createClient();
    let nextBalance = balance;
    if (decision === "approved") {
      const { data } = await supabase.from("leave_balances").select("*").eq("user_id", row.user_id).maybeSingle();
      const current = (data as LeaveBalance | null) ?? emptyBalance(row.user_id);
      const applied = applyLeaveDecision(row, current, "approved");
      if (applied.error) {
        setError(applied.error);
        return;
      }
      nextBalance = applied.balance;
      await supabase.from("leave_balances").upsert(nextBalance);
    }
    const { error: err } = await supabase
      .from("leave_requests")
      .update({ status: decision, decided_by: app.userId, decided_at: new Date().toISOString() })
      .eq("id", row.id);
    if (err) {
      setError(err.message);
      return;
    }
    setQueue((prev) => prev.filter((item) => item.id !== row.id));
    if (row.user_id === app.userId) {
      setMine((prev) => (prev ?? []).map((item) => (item.id === row.id ? { ...item, status: decision } : item)));
      if (nextBalance && nextBalance.user_id === app.userId) setBalance(nextBalance);
    }
  }

  if (!app || mine === null) return <PageFallback />;

  const days = leaveDayCount(start, end);

  return (
    <div>
      <PageHeader
        title="Leave"
        description="Ask for days off. A manager approves. You cannot approve your own request."
      />
      <ErrorText className="mb-4">{error}</ErrorText>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <BalanceCard label="Casual left" value={balance?.casual_days ?? 0} />
        <BalanceCard label="Sick left" value={balance?.sick_days ?? 0} />
        <BalanceCard label="Earned left" value={balance?.earned_days ?? 0} />
        <BalanceCard label="Unpaid used" value={balance?.unpaid_used ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {manager && queue.length > 0 ? (
            <Card>
              <h2 className="text-xl font-semibold">Waiting on you</h2>
              <ul className="mt-4 space-y-3">
                {queue.map((row) => (
                  <li key={row.id} className="rounded-[12px] border border-rule bg-surface px-4 py-3">
                    <p className="font-medium">
                      {displayName(people[row.user_id])} · {LEAVE_TYPE_LABELS[row.leave_type]} · {row.days} day
                      {row.days === 1 ? "" : "s"}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {row.start_date} → {row.end_date}
                      {row.reason ? ` · ${row.reason}` : ""}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => void decide(row, "approved")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void decide(row, "rejected")}>
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-xl font-semibold">Your requests</h2>
            {mine.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">None yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-rule">
                {mine.map((row) => (
                  <li key={row.id} className="flex items-center justify-between py-3 text-sm">
                    <span>
                      {LEAVE_TYPE_LABELS[row.leave_type]} · {row.start_date} → {row.end_date} · {row.days}d
                    </span>
                    <span className="capitalize text-ink-soft">{row.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-xl border border-rule bg-cream p-5 shadow-card">
          <h2 className="text-xl font-semibold">New request</h2>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
              {LEAVE_TYPES.map((key) => (
                <option key={key} value={key}>
                  {LEAVE_TYPE_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <DatePicker value={start || null} onChange={(v) => setStart(v || "")} required />
          </Field>
          <Field label="To">
            <DatePicker value={end || null} onChange={(v) => setEnd(v || "")} required />
          </Field>
          <Field label="Reason">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="min-h-[5rem]" />
          </Field>
          <p className="text-sm text-ink-soft">{days ? `${days} day${days === 1 ? "" : "s"}` : "Pick dates"}</p>
          <Button type="submit" disabled={busy || days <= 0}>
            {busy ? "Sending…" : "Ask for leave"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function BalanceCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-rule bg-cream px-4 py-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-[28px] font-semibold tabular-nums leading-none">{value}</p>
    </div>
  );
}
