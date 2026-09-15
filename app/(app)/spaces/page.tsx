"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, PageHeader } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { canCreateSpace, missingSpacesSchema, SPACE_COLORS } from "@/lib/spaces";
import { isOverdue } from "@/lib/datetime";
import type { Space, Task } from "@/lib/types";

export default function SpacesPage() {
  const app = useAppState();
  const router = useRouter();
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
      supabase.from("tasks").select("id, space_id, status, due_date"),
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
      if (task.status !== "done") row.open += 1;
      if (isOverdue(task.due_date, task.status)) row.overdue += 1;
      map.set(task.space_id, row);
    }
    return map;
  }, [tasks]);

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

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Each board is a team’s work in three columns: To do, Doing, Done."
        actions={
          allowCreate ? (
            <Button type="button" variant={creating ? "secondary" : "primary"} onClick={() => setCreating((v) => !v)}>
              {creating ? "Cancel" : "New board"}
            </Button>
          ) : null
        }
      />
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {allowCreate && creating ? (
        <form onSubmit={create} className="mb-8 flex flex-wrap items-end gap-3 rounded-2xl border border-rule bg-cream p-4">
          <Field label="Board name" className="min-w-[16rem] flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ops, Hiring, Launch…" required autoFocus />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">Color</p>
            <div className="flex gap-2">
              {SPACE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-8 w-8 rounded-full border-2"
                  style={{ background: c, borderColor: color === c ? "#fff" : "transparent" }}
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
        <p className="rounded-2xl border border-dashed border-rule px-4 py-12 text-center text-sm text-ink-soft">
          No boards yet. Create one to start assigning work.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {spaces.map((space) => {
            const c = counts.get(space.id) ?? { open: 0, overdue: 0 };
            return (
              <li key={space.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/spaces/${space.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-rule bg-cream p-4 text-left transition hover:border-white/20"
                >
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: space.color || "#FF5A1F" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{space.name}</span>
                    <span className="text-xs text-ink-soft">
                      {c.open} open
                      {c.overdue ? <span className="text-red-400"> · {c.overdue} overdue</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
