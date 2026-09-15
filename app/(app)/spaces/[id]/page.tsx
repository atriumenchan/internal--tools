"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, PageHeader, Select } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { PageFallback } from "@/components/app-nav";
import { TaskCard } from "@/components/task-card";
import { Avatar } from "@/components/avatar";
import { displayName, missingSpacesSchema, nextTaskStatus, TASK_COLUMNS, TASK_STATUS_LABELS } from "@/lib/spaces";
import { dueDateKey } from "@/lib/datetime";
import type { Profile, Space, Task, TaskStatus } from "@/lib/types";

export default function SpaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [space, setSpace] = useState<Space | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviteId, setInviteId] = useState("");
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    void (async () => {
      const [spaceRes, tasksRes, memberRes, peopleRes, convRes] = await Promise.all([
        supabase.from("spaces").select("id, name, color, created_by, created_at").eq("id", id).maybeSingle(),
        supabase.from("tasks").select("*").eq("space_id", id).order("created_at", { ascending: false }),
        supabase.from("space_members").select("user_id").eq("space_id", id),
        supabase.from("profiles").select("id, email, full_name, role").order("full_name"),
        supabase.from("conversations").select("id").eq("space_id", id).eq("type", "space").maybeSingle(),
      ]);
      if (spaceRes.error || !spaceRes.data) {
        setError(
          missingSpacesSchema(spaceRes.error?.message)
            ? "Task boards are not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor."
            : spaceRes.error?.message || "Board not found."
        );
        return;
      }
      const allPeople = (peopleRes.data ?? []) as Profile[];
      const memberIds = new Set((memberRes.data ?? []).map((row) => row.user_id as string));
      setSpace(spaceRes.data as Space);
      setTasks((tasksRes.data ?? []) as Task[]);
      setPeople(allPeople);
      setMembers(allPeople.filter((p) => memberIds.has(p.id)));
      setConversationId((convRes.data as { id?: string } | null)?.id ?? null);
    })();
  }, [id]);

  const columns = useMemo(() => {
    const by: Record<TaskStatus, Task[]> = { open: [], in_progress: [], done: [] };
    for (const task of tasks) by[task.status].push(task);
    return by;
  }, [tasks]);

  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);
  const outsiders = people.filter((p) => !members.some((m) => m.id === p.id));

  async function setStatus(task: Task, status: TaskStatus) {
    const supabase = createClient();
    const { data, error: err } = await supabase.from("tasks").update({ status }).eq("id", task.id).select("*").single();
    if (err) {
      setError(err.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? (data as Task) : t)));
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!space || !title.trim()) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user.id;
    if (!userId) return;
    const { data, error: err } = await supabase
      .from("tasks")
      .insert({
        space_id: space.id,
        title: title.trim(),
        assignee_id: assigneeId || null,
        created_by: userId,
        due_date: dueDateKey(dueDate),
        status: "open",
      })
      .select("*")
      .single();
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setTasks((prev) => [data as Task, ...prev]);
    setTitle("");
    setAssigneeId("");
    setDueDate("");
    setAdding(false);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteId || !space) return;
    const supabase = createClient();
    const { error: err } = await supabase.rpc("add_space_member", { p_space_id: space.id, p_user_id: inviteId });
    if (err) {
      setError(err.message);
      return;
    }
    const person = people.find((p) => p.id === inviteId);
    if (person) setMembers((prev) => [...prev, person]);
    setInviteId("");
  }

  if (error && !space) {
    return <PageHeader title="Board" description={error} />;
  }
  if (!space) return <PageFallback />;

  return (
    <div>
      <p className="mb-3 text-sm">
        <Link href="/spaces" className="text-ink-soft hover:text-ink">
          ← All boards
        </Link>
      </p>
      <PageHeader
        title={space.name}
        description="Click a task to open it. Click the status chip to move it: To do → Doing → Done."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex -space-x-2">
              {members.slice(0, 6).map((m) => (
                <Avatar key={m.id} name={displayName(m)} className="border border-paper" />
              ))}
            </div>
            {conversationId ? (
              <Link href={`/chat?c=${conversationId}`}>
                <Button variant="secondary">Chat</Button>
              </Link>
            ) : null}
          </div>
        }
      />
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      {outsiders.length > 0 ? (
        <form onSubmit={invite} className="mb-5 flex max-w-md items-center gap-2">
          <Select value={inviteId} onChange={(e) => setInviteId(e.target.value)} required>
            <option value="">Add a person to this board</option>
            {outsiders.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" variant="secondary">
            Add
          </Button>
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {TASK_COLUMNS.map((col) => (
          <section key={col.status} className="rounded-xl border border-rule bg-surface p-3 shadow-card">
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="font-semibold">{TASK_STATUS_LABELS[col.status]}</h2>
              <span className="text-xs text-ink-soft">
                {columns[col.status].length} · {col.hint}
              </span>
            </div>
            {col.status === "open" ? (
              adding ? (
                <form onSubmit={createTask} className="mb-3 space-y-2 rounded-[12px] border border-rule bg-cream p-3">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" required autoFocus />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Who">
                      <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {displayName(m)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Due">
                      <DatePicker value={dueDate || null} onChange={(v) => setDueDate(v || "")} placeholder="Due date" />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={busy}>
                      {busy ? "Adding…" : "Add"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="mb-3 w-full rounded-[12px] border border-dashed border-rule bg-input px-3 py-2.5 text-left text-sm text-muted transition duration-200 hover:border-line-hover hover:text-ink"
                >
                  + Add a task
                </button>
              )
            ) : null}
            <ul className="space-y-2">
              {columns[col.status].map((task) => (
                <li key={task.id}>
                  <TaskCard
                    task={task}
                    href={`/spaces/${space.id}/tasks/${task.id}`}
                    assignee={task.assignee_id ? memberMap[task.assignee_id] : null}
                    onAdvance={() => void setStatus(task, nextTaskStatus(task.status))}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
