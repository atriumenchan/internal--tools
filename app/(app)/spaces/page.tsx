"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, PageHeader, Select } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageFallback } from "@/components/app-nav";
import { useAppState, useWorkspaceCache } from "@/components/app-frame";
import { canCreateSpace, displayName, missingSpacesSchema, SPACE_COLORS } from "@/lib/spaces";
import { isOverdue } from "@/lib/datetime";
import { useSilentLive } from "@/lib/silent-live";
import { canManageSpace } from "@/lib/task-workflow";
import { isIgnoredEmployee } from "@/lib/admin";
import type { Profile, Space, Task } from "@/lib/types";

function SpacesPageInner() {
  const app = useAppState();
  const cache = useWorkspaceCache();
  const router = useRouter();
  const search = useSearchParams();
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SPACE_COLORS[0]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const allowCreate = canCreateSpace(app?.profile, app?.anyoneCanCreateSpaces ?? true);
  const actor = app ? { id: app.userId, email: app.profile.email, role: app.profile.role } : null;

  const loadTasks = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
  }, []);

  useEffect(() => {
    const params = search.toString();
    if (search.get("slice") || search.get("filter") || search.get("person")) {
      router.replace(`/tasks?${params}`);
    }
  }, [router, search]);

  useEffect(() => {
    const supabase = createClient();
    void Promise.all([
      supabase.from("spaces").select("id, name, color, created_by, created_at").order("name"),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, email, full_name, role").order("full_name"),
    ]).then(([spaceRes, taskRes, peopleRes]) => {
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
      setPeople((peopleRes.data ?? []) as Profile[]);
    });
  }, []);

  useSilentLive(() => void loadTasks(), "spaces");

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

  const peopleOptions = useMemo(() => {
    const rows: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    const myId = app?.userId;
    for (const employee of cache?.employees ?? []) {
      if (!employee.user_id || employee.user_id === myId || seen.has(employee.user_id)) continue;
      if (isIgnoredEmployee(employee.employee_code, employee.full_name)) continue;
      seen.add(employee.user_id);
      rows.push({ id: employee.user_id, label: `${employee.employee_code} · ${employee.full_name}` });
    }
    for (const profile of people) {
      if (!profile.id || profile.id === myId || seen.has(profile.id)) continue;
      seen.add(profile.id);
      rows.push({ id: profile.id, label: displayName(profile) });
    }
    return rows;
  }, [cache?.employees, people, app?.userId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!allowCreate) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("create_space", { p_name: name, p_color: color });
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    if (typeof data === "string") {
      for (const userId of memberIds) {
        await supabase.rpc("add_space_member", { p_space_id: data, p_user_id: userId });
      }
      router.push(`/spaces/${data}`);
    }
    setBusy(false);
  }

  async function deleteSpace(space: Space) {
    if (!canManageSpace(space, actor)) {
      setError("Only the person who created this board, or a manager, can delete it.");
      return;
    }
    const supabase = createClient();
    const { error: err } = await supabase.from("spaces").delete().eq("id", space.id);
    if (err) {
      setError(
        err.message.includes("row-level security") || err.message.includes("policy")
          ? "Could not delete this board. Paste supabase/space-owner.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      return;
    }
    setSpaces((prev) => (prev ?? []).filter((row) => row.id !== space.id));
  }

  return (
    <div>
      <PageHeader
        title="Spaces"
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
      {allowCreate && creating ? (
        <form onSubmit={create} className="mb-8 space-y-4 rounded-md border border-border bg-surface p-4 shadow-card">
          <div className="flex flex-wrap items-end gap-3">
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
          </div>
          <Field label="People">
            <div className="flex flex-wrap gap-2">
              <Select
                className="min-w-[16rem] flex-1"
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id && !memberIds.includes(id)) setMemberIds([...memberIds, id]);
                }}
              >
                <option value="">{peopleOptions.length === 0 ? "No people with a login yet." : "Select a person"}</option>
                {peopleOptions
                  .filter((row) => !memberIds.includes(row.id))
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
              </Select>
              <Button
                type="button"
                variant="secondary"
                disabled={peopleOptions.length === 0 || memberIds.length === peopleOptions.length}
                onClick={() => setMemberIds(peopleOptions.map((row) => row.id))}
              >
                Add everyone
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted">You are on the board already. Add everyone, or pick people one by one.</p>
            {memberIds.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {memberIds.map((id) => {
                  const label = peopleOptions.find((p) => p.id === id)?.label || id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMemberIds(memberIds.filter((x) => x !== id))}
                      className="rounded-sm bg-teal-dim px-2 py-0.5 text-[11px] font-medium text-teal"
                    >
                      {label} ×
                    </button>
                  );
                })}
              </div>
            ) : null}
          </Field>
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
                  {canManageSpace(space, actor) ? (
                    <ConfirmDelete
                      label="Delete board"
                      title="Delete this board?"
                      description="All tasks, comments, and files on this board will be removed."
                      onConfirm={() => deleteSpace(space)}
                    />
                  ) : null}
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
