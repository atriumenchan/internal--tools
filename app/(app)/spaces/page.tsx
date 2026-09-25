"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, PageHeader, Select } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageFallback } from "@/components/app-nav";
import { useAppState, useWorkspaceCache } from "@/components/app-frame";
import { TaskListRow } from "@/components/task-card";
import { type TaskDraft } from "@/components/task-form";
import { Segmented } from "@/components/overflow-strip";
import { isAdminUser, isIgnoredEmployee } from "@/lib/admin";
import { canCreateSpace, displayName, missingPriorityColumn, missingSpacesSchema, SPACE_COLORS } from "@/lib/spaces";
import { compareDueSoon, dueDateKey, isOverdue, kolkataTodayKey } from "@/lib/datetime";
import { useSilentLive } from "@/lib/silent-live";
import { pingTaskAssigned } from "@/lib/ping-task";
import { applyTaskStatus, canDeleteTask, canManageSpace, canManageTask, canMoveTask, missingWorkflowColumn } from "@/lib/task-workflow";
import { parseTaskSlice, sliceTasks, taskSliceCounts, tasksForPerson, type TaskSlice } from "@/lib/task-overview";
import type { Profile, Space, Task, TaskStatus } from "@/lib/types";

function SpacesPageInner() {
  const app = useAppState();
  const cache = useWorkspaceCache();
  const router = useRouter();
  const search = useSearchParams();
  const admin = app ? isAdminUser(app.profile) : false;
  const slice = parseTaskSlice(search.get("slice") || search.get("filter"));
  const personParam = search.get("person");
  const person = admin ? personParam || "all" : "me";
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
  const todayKey = kolkataTodayKey();
  const actor = app ? { id: app.userId, email: app.profile.email, role: app.profile.role } : null;

  const loadTasks = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
  }, []);

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

  const peopleMap = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const spaceMap = useMemo(() => Object.fromEntries((spaces ?? []).map((s) => [s.id, s])), [spaces]);
  const ignoredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const employee of cache?.employees ?? []) {
      if (employee.user_id && isIgnoredEmployee(employee.employee_code, employee.full_name)) ids.add(employee.user_id);
    }
    return ids;
  }, [cache?.employees]);

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

  const scoped = useMemo(() => tasksForPerson(tasks, person, app?.userId), [tasks, person, app?.userId]);
  const sliceCounts = useMemo(() => taskSliceCounts(scoped, todayKey), [scoped, todayKey]);
  const listed = useMemo(() => {
    const rows = sliceTasks(scoped, slice, todayKey);
    if (slice === "closed") {
      return [...rows].sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
    }
    return [...rows].sort(compareDueSoon);
  }, [scoped, slice, todayKey]);

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
      if (!profile.id || profile.id === myId || seen.has(profile.id) || ignoredIds.has(profile.id)) continue;
      seen.add(profile.id);
      rows.push({ id: profile.id, label: displayName(profile) });
    }
    return rows;
  }, [cache?.employees, people, app?.userId, ignoredIds]);

  function setOverview(next: { slice?: TaskSlice; person?: string }) {
    const params = new URLSearchParams();
    params.set("slice", next.slice ?? slice);
    if (admin) params.set("person", next.person ?? person);
    router.replace(`/spaces?${params.toString()}`);
  }

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

  async function setStatus(taskId: string, status: TaskStatus) {
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === status || !app) return;
    const next = applyTaskStatus(current, status, app.userId, app.profile);
    if (next.error && next.status === current.status) {
      setError(next.error);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: next.status } : t)));
    const supabase = createClient();
    const { data, error: err } = await supabase.from("tasks").update({ status: next.status }).eq("id", taskId).select("*").single();
    if (err) {
      setError(
        err.message.includes("row-level security") || err.message.includes("policy") || err.message.includes("created this task")
          ? "Could not move this task. Paste supabase/assignee-move.sql in the Supabase SQL editor, then try again."
          : missingWorkflowColumn(err.message)
            ? "Task review needs a SQL patch. Paste supabase/workspace-lite.sql in the Supabase SQL editor, then refresh."
            : err.message
      );
      setTasks((prev) => prev.map((t) => (t.id === taskId ? current : t)));
      return;
    }
    if (data) setTasks((prev) => prev.map((t) => (t.id === taskId ? (data as Task) : t)));
  }

  async function editTask(taskId: string, values: TaskDraft) {
    if (!app) return false;
    const current = tasks.find((t) => t.id === taskId);
    if (!current || !canManageTask(current, actor)) {
      setError("Only the person who created this task, or a manager, can change it. You can still comment.");
      return false;
    }
    const supabase = createClient();
    const assigneeId = values.assigneeId || null;
    const payload = {
      title: values.title.trim(),
      description: values.comment.trim() || null,
      completion_criteria: values.criteria.trim() || null,
      assignee_id: assigneeId,
      due_date: dueDateKey(values.dueDate),
      priority: values.priority,
    };
    const { data, error: err } = await supabase.from("tasks").update(payload).eq("id", taskId).select("*").single();
    if (err || !data) {
      setError(
        missingPriorityColumn(err?.message) || missingWorkflowColumn(err?.message)
          ? "Task review needs a SQL patch. Paste supabase/workspace-lite.sql in the Supabase SQL editor, then refresh."
          : err?.message || "Could not save the task."
      );
      return false;
    }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? (data as Task) : t)));
    if (assigneeId && assigneeId !== current.assignee_id) {
      pingTaskAssigned({
        title: (data as Task).title,
        assigneeName: displayName(peopleMap[assigneeId] || people.find((p) => p.id === assigneeId)),
        byName: displayName(app.profile),
        spaceName: spaceMap[(data as Task).space_id]?.name,
        due: (data as Task).due_date,
        path: `/spaces/${(data as Task).space_id}/tasks/${taskId}`,
        assigneeId,
      });
    }
    return true;
  }

  async function deleteTask(taskId: string) {
    const supabase = createClient();
    const { error: err } = await supabase.from("tasks").delete().eq("id", taskId);
    if (err) {
      setError(
        err.message.includes("row-level security") || err.message.includes("policy")
          ? "Could not delete this task. Paste supabase/task-delete.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  const sliceLabel = slice === "closed" ? "Closed today" : slice === "overdue" ? "Overdue today" : "Left";
  const personLabel =
    !admin || person === "all"
      ? admin
        ? "everyone"
        : "you"
      : person === "me"
        ? "you"
        : displayName(peopleMap[person]);

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={
          admin
            ? "Every person, every board, in one list. Pick someone and a filter."
            : "Your tasks across every board you are on."
        }
        actions={
          allowCreate ? (
            <Button type="button" variant={creating ? "secondary" : "primary"} onClick={() => setCreating((v) => !v)}>
              {creating ? "Cancel" : "New board"}
            </Button>
          ) : null
        }
      />
      {error ? <p className="mb-4 text-sm text-coral">{error}</p> : null}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={slice}
          onChange={(next) => setOverview({ slice: next })}
          options={[
            { id: "left", label: `Left (${sliceCounts.left})` },
            { id: "closed", label: `Closed today (${sliceCounts.closed})` },
            { id: "overdue", label: `Overdue today (${sliceCounts.overdue})` },
          ]}
        />
        {admin ? (
          <Select
            value={person}
            onChange={(e) => setOverview({ person: e.target.value })}
            className="w-[14rem]"
            aria-label="Whose tasks"
          >
            <option value="all">Everyone</option>
            <option value="me">My tasks</option>
            {peopleOptions.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      <section className="mb-8 overflow-hidden rounded-md border border-border bg-surface shadow-card">
        <div
          className={`hidden border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted md:grid md:gap-3 ${
            "md:grid-cols-[minmax(0,1.4fr)_8rem_7rem_7rem_8.5rem_2.25rem]"
          }`}
        >
          <span>Task</span>
          <span>Person</span>
          <span>Board</span>
          <span>Due</span>
          <span>Status</span>
          <span />
        </div>
        {listed.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-faint">
            No {sliceLabel.toLowerCase()} for {personLabel}.
          </p>
        ) : (
          <ul>
            {listed.map((task) => (
              <li key={task.id}>
                <TaskListRow
                  task={task}
                  href={`/spaces/${task.space_id}/tasks/${task.id}`}
                  assignee={task.assignee_id ? peopleMap[task.assignee_id] : null}
                  members={people}
                  spaceName={spaceMap[task.space_id]?.name || "Board"}
                  onMove={canMoveTask(task, actor) ? (status) => void setStatus(task.id, status) : undefined}
                  onEdit={canManageTask(task, actor) ? (values) => editTask(task.id, values) : undefined}
                  onDelete={canDeleteTask(task, actor) ? () => deleteTask(task.id) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

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

      <h2 className="mb-3 font-display text-xl font-medium tracking-tight">Boards</h2>
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
