"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { displayName, TASK_STATUS_LABELS } from "@/lib/spaces";
import { dueDateKey } from "@/lib/datetime";
import { useAppState } from "@/components/app-frame";
import type { Profile, Space, Task, TaskComment, TaskFile, TaskStatus } from "@/lib/types";

export default function TaskPage() {
  const app = useAppState();
  const { id, taskId } = useParams<{ id: string; taskId: string }>();
  const [space, setSpace] = useState<Space | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id || !taskId) return;
    const supabase = createClient();
    void (async () => {
      const [spaceRes, taskRes, memberRes, commentRes, peopleRes, filesRes] = await Promise.all([
        supabase.from("spaces").select("*").eq("id", id).maybeSingle(),
        supabase.from("tasks").select("*").eq("id", taskId).maybeSingle(),
        supabase.from("space_members").select("user_id").eq("space_id", id),
        supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at"),
        supabase.from("profiles").select("id, email, full_name, role"),
        supabase.from("task_files").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
      ]);
      if (taskRes.error || !taskRes.data) {
        setError(taskRes.error?.message || "Task not found.");
        return;
      }
      const allPeople = (peopleRes.data ?? []) as Profile[];
      const byId = Object.fromEntries(allPeople.map((p) => [p.id, p]));
      const memberIds = new Set((memberRes.data ?? []).map((row) => row.user_id as string));
      setSpace((spaceRes.data as Space) ?? null);
      setTask(taskRes.data as Task);
      setMembers(allPeople.filter((p) => memberIds.has(p.id)));
      setComments((commentRes.data ?? []) as TaskComment[]);
      setFiles((filesRes.data ?? []) as TaskFile[]);
      setProfiles(byId);
    })();
  }, [id, taskId]);

  useEffect(() => {
    if (!taskId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`task-comments:${taskId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` },
        (payload) => {
          const row = payload.new as TaskComment;
          setComments((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]));
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [taskId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  async function saveTask(patch: Partial<Task>) {
    if (!task) return;
    const supabase = createClient();
    const { data, error: err } = await supabase.from("tasks").update(patch).eq("id", task.id).select("*").single();
    if (err) {
      setError(err.message);
      return;
    }
    setTask(data as Task);
  }

  async function uploadFile(file: File) {
    if (!task || !app) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("Each file must be 8 MB or smaller (Supabase free plan).");
      return;
    }
    const supabase = createClient();
    const safe = file.name.replace(/[^\w.-]+/g, "_");
    const path = `${task.id}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from("task-files").upload(path, file);
    if (upErr) {
      setError(
        upErr.message.includes("Bucket not found") || upErr.message.includes("not found")
          ? "File storage is not set up yet. Paste supabase/workspace-plus.sql in the Supabase SQL editor."
          : upErr.message
      );
      return;
    }
    const { data, error: err } = await supabase
      .from("task_files")
      .insert({
        task_id: task.id,
        path,
        file_name: file.name,
        file_size: file.size,
        uploaded_by: app.userId,
      })
      .select("*")
      .single();
    if (err) {
      setError(err.message);
      return;
    }
    setFiles((prev) => [data as TaskFile, ...prev]);
  }

  async function openFile(file: TaskFile) {
    const supabase = createClient();
    const { data, error: err } = await supabase.storage.from("task-files").createSignedUrl(file.path, 120);
    if (err || !data?.signedUrl) {
      setError(err?.message || "Could not open file.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !body.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user.id;
    if (!userId) return;
    const { data, error: err } = await supabase
      .from("task_comments")
      .insert({ task_id: task.id, author_id: userId, body: body.trim() })
      .select("*")
      .single();
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setComments((prev) => (prev.some((c) => c.id === (data as TaskComment).id) ? prev : [...prev, data as TaskComment]));
    setBody("");
  }

  if (error && !task) {
    return <PageHeader title="Task" description={error} />;
  }
  if (!task) return <PageFallback />;

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href={`/spaces/${id}`} className="text-terracotta">
          ← {space?.name || "Space"}
        </Link>
      </p>
      <PageHeader
        eyebrow="Task"
        title={task.title}
        actions={
          <Badge tone={task.status === "done" ? "ok" : task.status === "in_progress" ? "info" : "neutral"}>
            {TASK_STATUS_LABELS[task.status]}
          </Badge>
        }
      />
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div>
          <Field label="Description" className="mb-6">
            <Textarea
              value={task.description || ""}
              onChange={(e) => setTask({ ...task, description: e.target.value })}
              onBlur={() => void saveTask({ description: task.description })}
              rows={6}
            />
          </Field>
          <h2 className="mb-3 text-lg font-semibold">Comments</h2>
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-2xl border border-rule bg-cream px-4 py-3">
                <p className="text-xs text-ink-soft">
                  {displayName(profiles[comment.author_id])} · {new Date(comment.created_at).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
              </li>
            ))}
          </ul>
          <div ref={bottom} />
          <form onSubmit={addComment} className="mt-4 space-y-2">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Write a comment" required />
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Comment"}
            </Button>
          </form>
        </div>
        <aside className="space-y-4 rounded-2xl border border-rule bg-cream p-4">
          <Field label="Status">
            <Select
              value={task.status}
              onChange={(e) => {
                const status = e.target.value as TaskStatus;
                setTask({ ...task, status });
                void saveTask({ status });
              }}
            >
              {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assignee">
            <Select
              value={task.assignee_id || ""}
              onChange={(e) => {
                const assignee_id = e.target.value || null;
                setTask({ ...task, assignee_id });
                void saveTask({ assignee_id });
              }}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {displayName(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              value={dueDateKey(task.due_date) || ""}
              onChange={(e) => {
                const due_date = dueDateKey(e.target.value);
                setTask({ ...task, due_date });
                void saveTask({ due_date });
              }}
            />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">Files</p>
            <p className="mb-2 text-[11px] text-ink-soft">Optional. 8 MB each. Shared 1 GB on the free plan.</p>
            <input
              type="file"
              className="w-full text-xs"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFile(file);
                e.currentTarget.value = "";
              }}
            />
            <ul className="mt-2 space-y-1 text-sm">
              {files.map((file) => (
                <li key={file.id}>
                  <button type="button" className="text-terracotta hover:underline" onClick={() => void openFile(file)}>
                    {file.file_name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
