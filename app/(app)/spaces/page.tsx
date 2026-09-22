"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, PageHeader } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { canCreateSpace, missingSpacesSchema, SPACE_COLORS } from "@/lib/spaces";
import { isOverdue } from "@/lib/datetime";
import { effectiveReviewer } from "@/lib/task-workflow";
import type { Space, Task } from "@/lib/types";

function SpacesPageInner() {
  const app = useAppState();
  const router = useRouter();
  const search = useSearchParams();
  const filter = search.get("filter");
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SPACE_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const allowCreate = canCreateSpace(app?.profile, app?.anyoneCanCreateSpaces ?? true);

  useEffect(() => {
    const supabase = createClient();
    void Promise.all([
      supabase.from("spaces").select("id, name, color, created_by, created_at").order("name"),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
    ]).then(([spaceRes, taskRes]) => {
      if (spaceRes.error) {
        setError(
          missingSpacesSchema(spaceRes.error.message)
            ? "Task boards are not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor, then refresh."
            : spaceRes.error.message
        );
        setSpaces([]);
        return;
      }
      setSpaces((spaceRes.data ?? []) as Space[]);
      setTasks((taskRes.data ?? []) as Task[]);
    });
  }, []);

  const counts = useMemo(() => {
    const map = new Map<string, { open: number; overdue: number }>();
    for (const task of tasks) {
      const row = map.get(task.space_id) ?? { open: 0, overdue: 0 };
      if (task.status !== "done" && task.status !== "cancelled") row.open += 1;
      if (isOverdue(task.due_date, task.status)) row.overdue += 1;
      map.set(task.space_id, row);
    }
    return map;
  }, [tasks]);

  const myId = app?.userId;
  const listed = useMemo(() => {
    if (!myId) return [];
    if (filter === "review") return tasks.filter((t) => t.status === "in_review" && effectiveReviewer(t) === myId);
    if (filter === "overdue") return tasks.filter((t) => isOverdue(t.due_date, t.status));
    if (filter === "mine") {
      return tasks.filter((t) => t.assignee_id === myId && t.status !== "done" && t.status !== "cancelled");
    }
    return [];
  }, [filter, tasks, myId]);
  const listTitle = filter === "review" ? "To review" : filter === "overdue" ? "Overdue" : "Your tasks";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!allowCreate) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("create_space", { p_name: name, p_color: color });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (typeof data === "string") router.push(`/spaces/${data}`);
  }

  async function deleteSpace(space: Space) {
    const supabase = createClient();
    const { error: err } = await supabase.from("spaces").delete().eq("id", space.id);
    if (err) {
      setError(
        err.message.includes("row-level security") || err.message.includes("policy")
          ? "Could not delete this board. Paste supabase/deletes.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      return;
    }
    setSpaces((prev) => (prev ?? []).filter((row) => row.id !== space.id));
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Each board is To do, Doing, Review, and Done."
        actions={
          allowCreate ? (
            <Button type="button" variant={creating ? "secondary" : "primary"} onClick={() => setCreating((v) => !v)}>
              {creating ? "Cancel" : "New board"}
            </Button>
          ) : null
        }
      />
      {error ? <p className="mb-4 text-sm text-coral">{error}</p> : null}
      {filter && listed.length === 0 ? (
        <p className="mb-6 rounded-md border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-faint">
          No {listTitle.toLowerCase()} right now.
        </p>
      ) : null}
      {filter && listed.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl font-medium tracking-tight">{listTitle}</h2>
          <ul className="space-y-2">
            {listed.map((task) => {
              const board = spaces?.find((s) => s.id === task.space_id);
              return (
                <li key={task.id}>
                  <Link
                    href={`/spaces/${task.space_id}/tasks/${task.id}`}
                    className="block rounded-md border border-border bg-surface px-4 py-3 shadow-card transition duration-150 hover:bg-surface-2"
                  >
                    <span className="block font-medium text-ink">{task.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {board?.name || "Board"}
                      {task.status === "in_review" ? " · Review" : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {allowCreate && creating ? (
        <form onSubmit={create} className="mb-8 flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface p-4 shadow-card">
          <Field label="Board name" className="min-w-[16rem] flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ops, Hiring, Launch…" required autoFocus />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Color</p>
            <div className="flex gap-2">
              {SPACE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-8 w-8 rounded-full border-2"
                  style={{ background: c, borderColor: color === c ? "var(--text)" : "transparent" }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create board"}
          </Button>
        </form>
      ) : null}
      {spaces === null ? (
        <PageFallback />
      ) : spaces.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-surface px-4 py-12 text-center text-sm text-faint">
          No boards yet
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {spaces.map((space) => {
            const c = counts.get(space.id) ?? { open: 0, overdue: 0 };
            return (
              <li key={space.id}>
                <div className="flex items-stretch gap-2 rounded-md border border-border bg-surface p-4 shadow-card transition duration-200 hover:bg-surface-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/spaces/${space.id}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: space.color || "var(--amber)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{space.name}</span>
                      <span className="text-xs text-muted">
                        {c.open} open
                        {c.overdue ? <span className="text-coral"> · {c.overdue} overdue</span> : null}
                      </span>
                    </span>
                  </button>
                  <ConfirmDelete
                    label="Delete board"
                    title="Delete this board?"
                    description="All tasks, comments, and files on this board will be removed."
                    onConfirm={() => deleteSpace(space)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function SpacesPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <SpacesPageInner />
    </Suspense>
  );
}
