"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, ErrorText, Field, PageHeader, Textarea } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { FileDrop } from "@/components/file-drop";
import { Segmented } from "@/components/overflow-strip";
import { useAppState } from "@/components/app-frame";
import { displayName, missingSpacesSchema } from "@/lib/spaces";
import { dueDateKey, formatStamp, kolkataTodayKey } from "@/lib/datetime";
import { reportPeriodLabel, reportTitle } from "@/lib/reports";
import { useSilentLive } from "@/lib/silent-live";
import type { Space, Task } from "@/lib/types";

type Kind = "weekly" | "monthly";

export default function ReportsPage() {
  const app = useAppState();
  const [space, setSpace] = useState<Space | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [kind, setKind] = useState<Kind>("weekly");
  const [body, setBody] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = kolkataTodayKey();

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: spaceId, error: rpcErr } = await supabase.rpc("ensure_reports_space");
    if (rpcErr || !spaceId) {
      setError(
        rpcErr?.message.includes("ensure_reports_space") || rpcErr?.message.includes("schema cache")
          ? "Reports need a SQL patch. Paste supabase/everyone-reports.sql in the Supabase SQL editor, then refresh."
          : missingSpacesSchema(rpcErr?.message)
            ? "Task boards are not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor."
            : rpcErr?.message || "Could not open Reports."
      );
      setTasks([]);
      return;
    }
    const [spaceRes, taskRes] = await Promise.all([
      supabase.from("spaces").select("id, name, color, created_by, created_at").eq("id", spaceId).maybeSingle(),
      supabase.from("tasks").select("*").eq("space_id", spaceId).order("created_at", { ascending: false }),
    ]);
    setSpace((spaceRes.data as Space) ?? null);
    setTasks((taskRes.data ?? []) as Task[]);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSilentLive(() => void load(), "reports");

  const mine = useMemo(
    () => (tasks ?? []).filter((task) => task.created_by === app?.userId),
    [tasks, app?.userId]
  );

  async function attach(taskId: string, file: File) {
    const res = await fetch("/api/task-files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId, fileName: file.name, fileSize: file.size }),
    });
    const plan = (await res.json()) as { storage?: string; path?: string; url?: string; error?: string };
    if (!res.ok || !plan.path) throw new Error(plan.error || "Could not start the upload.");
    if (plan.storage === "r2") {
      const put = await fetch(plan.url as string, { method: "PUT", body: file });
      if (!put.ok) throw new Error("Could not reach cloud storage.");
    } else {
      const { error: upErr } = await createClient().storage.from("task-files").upload(plan.path, file);
      if (upErr) throw new Error(upErr.message);
    }
    const { error: err } = await createClient()
      .from("task_files")
      .insert({
        task_id: taskId,
        path: plan.path,
        file_name: file.name,
        file_size: file.size,
        uploaded_by: app?.userId,
        storage: plan.storage || "supabase",
      });
    if (err) throw new Error(err.message);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!space || !app || !body.trim()) return;
    setBusy(true);
    setError(null);
    const title = reportTitle(kind, displayName(app.profile), today);
    const supabase = createClient();
    const payload = {
      space_id: space.id,
      title,
      description: body.trim(),
      created_by: app.userId,
      assignee_id: app.userId,
      due_date: dueDateKey(today),
      status: "open" as const,
      priority: "medium" as const,
    };
    const { data, error: err } = await supabase.from("tasks").insert(payload).select("*").single();
    if (err || !data) {
      setBusy(false);
      setError(err?.message || "Could not submit the report.");
      return;
    }
    try {
      for (const file of pendingFiles) await attach(data.id, file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Report saved, but a file did not upload.");
    }
    setTasks((prev) => [data as Task, ...(prev ?? [])]);
    setBody("");
    setPendingFiles([]);
    setBusy(false);
  }

  if (!app || tasks === null) return <PageFallback />;

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Submit this week's or this month's write-up. It lands on the Reports board, where everyone can open it."
        actions={
          space ? (
            <Link href={`/spaces/${space.id}`} className="text-[13px] font-medium text-teal hover:text-teal-soft">
              Open the board
            </Link>
          ) : null
        }
      />
      <ErrorText className="mb-4">{error}</ErrorText>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { id: "weekly", label: "Weekly" },
                { id: "monthly", label: "Monthly" },
              ]}
            />
            <p className="text-sm text-muted">
              {kind === "weekly" ? "This week" : "This month"} · {reportPeriodLabel(kind, today)}
            </p>
            <Field label="Report">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                placeholder="What moved, what is stuck, and what you need."
              />
            </Field>
            <div>
              <p className="mb-2 text-[12px] font-medium text-muted">Files</p>
              <FileDrop
                onFile={(file) => setPendingFiles((prev) => [...prev, file])}
                hint={pendingFiles.length ? `${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} attached.` : "Optional. Spreadsheets, decks, or screenshots."}
              />
              {pendingFiles.length > 0 ? (
                <ul className="mt-2 space-y-1 text-[13px] text-muted">
                  {pendingFiles.map((file) => (
                    <li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{file.name}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setPendingFiles((prev) => prev.filter((row) => row !== file))}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <Button type="submit" disabled={busy || !body.trim()}>
              {busy ? "Submitting…" : `Submit ${kind} report`}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="font-display text-xl font-medium tracking-tight">Yours</h2>
          <p className="mt-1 mb-4 text-sm text-muted">Reports you have already sent.</p>
          {mine.length === 0 ? (
            <p className="text-[13px] text-faint">None yet.</p>
          ) : (
            <ul className="space-y-2">
              {mine.slice(0, 12).map((task) => (
                <li key={task.id}>
                  <Link href={`/spaces/${task.space_id}/tasks/${task.id}`} className="block rounded-sm border border-border px-3 py-2 hover:bg-surface-2">
                    <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
                    <p className="mt-0.5 text-[12px] text-muted">{formatStamp(task.created_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
