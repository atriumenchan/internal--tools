"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { displayName, missingSpacesSchema, TASK_STATUS_LABELS } from "@/lib/spaces";
import { dueDateKey, formatDueDate, isOverdue, kolkataTodayKey } from "@/lib/datetime";
import type { Profile, Space, Task, TaskStatus } from "@/lib/types";

export default function SpaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [space, setSpace] = useState<Space | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviteId, setInviteId] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "upcoming">("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
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
            ? "Spaces are not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor."
            : spaceRes.error?.message || "Space not found."
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

  const visible = useMemo(() => {
    const today = kolkataTodayKey();
    return tasks.filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      if (assigneeFilter !== "all" && (task.assignee_id || "") !== assigneeFilter) return false;
      const due = dueDateKey(task.due_date);
      if (dueFilter === "overdue" && (!due || due >= today || task.status === "done")) return false;
      if (dueFilter === "upcoming" && (!due || due < today)) return false;
      return true;
    });
  }, [tasks, statusFilter, assigneeFilter, dueFilter]);

  const outsiders = people.filter((p) => !members.some((m) => m.id === p.id));

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!space) return;
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
        description: description.trim() || null,
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
    setDescription("");
    setAssigneeId("");
    setDueDate("");
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
    return (
      <div>
        <PageHeader title="Space" description={error} />
      </div>
    );
  }

  if (!space) return <PageFallback />;

  return (
    <div>
      <PageHeader
        eyebrow="Space"
        title={space.name}
        description="Assign work to members. Comments live on each task. Chat for this Space is in Chat."
        actions={
          conversationId ? (
            <Link href={`/chat?c=${conversationId}`}>
              <Button variant="secondary">Open channel</Button>
            </Link>
          ) : null
        }
      />
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

      <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_280px]">
        <form onSubmit={createTask} className="space-y-3 rounded-2xl border border-rule bg-cream p-4">
          <h2 className="text-lg font-semibold">New task</h2>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Assignee">
              <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {displayName(m)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <p className="mt-1 text-xs text-ink-soft">Optional. Uses the calendar date in India (IST), not UTC.</p>
            </Field>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Add task"}
          </Button>
        </form>
        <div className="space-y-4">
          <div className="rounded-2xl border border-rule bg-cream p-4">
            <h2 className="text-lg font-semibold">Members</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {members.map((m) => (
                <li key={m.id}>{displayName(m)}</li>
              ))}
            </ul>
            {outsiders.length > 0 ? (
              <form onSubmit={invite} className="mt-4 space-y-2">
                <Select value={inviteId} onChange={(e) => setInviteId(e.target.value)} required>
                  <option value="">Invite someone</option>
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
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "all")} className="w-auto">
          <option value="all">All statuses</option>
          {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="w-auto">
          <option value="all">Anyone</option>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {displayName(m)}
            </option>
          ))}
        </Select>
        <Select value={dueFilter} onChange={(e) => setDueFilter(e.target.value as typeof dueFilter)} className="w-auto">
          <option value="all">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="upcoming">Upcoming</option>
        </Select>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-ink-soft">No tasks match these filters.</p>
      ) : (
        <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-cream">
          {visible.map((task) => {
            const assignee = members.find((m) => m.id === task.assignee_id);
            return (
              <li key={task.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/5"
                  onClick={() => router.push(`/spaces/${space.id}/tasks/${task.id}`)}
                >
                  <span>
                    <span className="block font-medium">{task.title}</span>
                    <span className="text-xs text-ink-soft">
                      {assignee ? displayName(assignee) : "Unassigned"}
                      {formatDueDate(task.due_date)
                        ? ` · due ${formatDueDate(task.due_date)}${isOverdue(task.due_date, task.status) ? " (overdue)" : ""}`
                        : ""}
                    </span>
                  </span>
                  <Badge tone={task.status === "done" ? "ok" : task.status === "in_progress" ? "info" : "neutral"}>
                    {TASK_STATUS_LABELS[task.status]}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
