"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, ErrorText, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { FileDrop } from "@/components/file-drop";
import { ConfirmDelete } from "@/components/confirm-delete";
import { MentionBody, MentionField } from "@/components/mention-field";
import { PageFallback } from "@/components/app-nav";
import { Avatar } from "@/components/avatar";
import {
  displayName,
  missingPriorityColumn,
  TASK_COLUMNS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  taskPriority,
} from "@/lib/spaces";
import { DatePicker } from "@/components/date-picker";
import { taskStatusClass } from "@/components/task-card";
import { dueDateKey } from "@/lib/datetime";
import { useAppState } from "@/components/app-frame";
import { applyTaskStatus, canApproveReview, canCompleteDirectly, isAssignedByOther, missingWorkflowColumn } from "@/lib/task-workflow";
import type { Profile, Space, Task, TaskComment, TaskFile, TaskStatus } from "@/lib/types";

export default function TaskPage() {
  const app = useAppState();
  const router = useRouter();
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
  const [titleDraft, setTitleDraft] = useState("");
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
      setTitleDraft((taskRes.data as Task).title);
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
      setError(
        missingPriorityColumn(err.message) || missingWorkflowColumn(err.message)
          ? "Task review needs a SQL patch. Paste supabase/workspace-lite.sql in the Supabase SQL editor, then refresh."
          : err.message
      );
      return;
    }
    setTask(data as Task);
    if (typeof patch.title === "string") setTitleDraft(patch.title);
  }

  async function uploadFile(file: File) {
    if (!task || !app) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("Each file must be 8 MB or smaller.");
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

  function deleteBlocked(message: string, kind: string) {
    return message.includes("row-level security") || message.includes("policy")
      ? `Could not delete this ${kind}. Paste supabase/deletes.sql in the Supabase SQL editor, then try again.`
      : message;
  }

  async function deleteTask() {
    if (!task) return;
    const supabase = createClient();
    const { error: err } = await supabase.from("tasks").delete().eq("id", task.id);
    if (err) {
      setError(deleteBlocked(err.message, "task"));
      return;
    }
    router.push(`/spaces/${id}`);
  }

  async function deleteComment(commentId: string) {
    const supabase = createClient();
    const { error: err } = await supabase.from("task_comments").delete().eq("id", commentId);
    if (err) {
      setError(deleteBlocked(err.message, "comment"));
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  async function deleteFile(file: TaskFile) {
    const supabase = createClient();
    await supabase.storage.from("task-files").remove([file.path]);
    const { error: err } = await supabase.from("task_files").delete().eq("id", file.id);
    if (err) {
      setError(deleteBlocked(err.message, "file"));
      return;
    }
    setFiles((prev) => prev.filter((row) => row.id !== file.id));
  }

  async function setStatus(status: TaskStatus) {
    if (!task || !app) return;
    const next = applyTaskStatus(task, status, app.userId);
    if (next.error && next.status === task.status) {
      setError(next.error);
      return;
    }
    await saveTask({ status: next.status });
  }

  if (error && !task) {
    return <PageHeader title="Task" description={error} />;
  }
  if (!task) return <PageFallback />;

  return (
    <div>
      <p className="mb-3 text-sm">
        <Link href={`/spaces/${id}`} className="text-muted transition duration-200 hover:text-ink">
          ← {space?.name || "Board"}
        </Link>
      </p>
      <PageHeader
        title={task.title}
        description={space?.name ? `On ${space.name} · edit the fields below, they save when you leave a box.` : undefined}
        actions={
          <ConfirmDelete
            label="Delete task"
            title="Delete this task?"
            description="The task, comments, and files will be removed."
            onConfirm={() => deleteTask()}
          />
        }
      />
      <ErrorText className="mb-4">{error}</ErrorText>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Card>
            <Field label="Title">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  if (titleDraft.trim() && titleDraft.trim() !== task.title) void saveTask({ title: titleDraft.trim() });
                  else setTitleDraft(task.title);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </Field>
            <div className="mt-4">
              <Field label="Brief">
              <Textarea
                value={task.description || ""}
                onChange={(e) => setTask({ ...task, description: e.target.value })}
                onBlur={() => void saveTask({ description: task.description })}
                rows={6}
                placeholder="What this is, and any links."
                className="min-h-[8rem]"
              />
            </Field>
            </div>
            <div className="mt-4">
              <Field label="Done looks like">
                <Textarea
                  value={task.completion_criteria || ""}
                  onChange={(e) => setTask({ ...task, completion_criteria: e.target.value })}
                  onBlur={() => void saveTask({ completion_criteria: task.completion_criteria })}
                  rows={4}
                  placeholder="What should be true when this is finished?"
                  className="min-h-[6rem]"
                />
              </Field>
            </div>
          </Card>

          <Card className="p-0">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-display text-xl font-medium tracking-tight">Comments</h2>
              <p className="mt-1 text-sm text-muted">Type @ to mention someone on this board.</p>
            </div>
            <div className="space-y-3 px-5 py-4">
              {comments.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-page px-4 py-6 text-center text-sm text-faint">
                  No comments yet
                </p>
              ) : (
                <ul className="space-y-3">
                  {comments.map((comment) => (
                    <li key={comment.id} className="flex gap-3 rounded-md border border-border bg-page px-4 py-3">
                      <Avatar name={displayName(profiles[comment.author_id])} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[12px] text-muted">
                          <span className="font-medium text-ink">{displayName(profiles[comment.author_id])}</span>
                          {" · "}
                          {new Date(comment.created_at).toLocaleString()}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                          <MentionBody text={comment.body} people={Object.values(profiles)} />
                        </p>
                      </div>
                      <ConfirmDelete
                        label="Delete comment"
                        title="Delete this comment?"
                        onConfirm={() => deleteComment(comment.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <div ref={bottom} />
              <form onSubmit={addComment} className="space-y-3 border-t border-border pt-4">
                <MentionField
                  value={body}
                  onChange={setBody}
                  people={Object.values(profiles)}
                  rows={3}
                  placeholder="Write a comment — type @ to mention someone"
                  required
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={busy}>
                    {busy ? "Sending…" : "Comment"}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>

        <aside>
          <Card className="divide-y divide-border p-0">
            <div className="px-4 py-4">
              <p className="mb-2 text-[12px] font-medium text-muted">Status</p>
              <div className="grid grid-cols-2 gap-1 rounded-sm border border-border bg-surface-2 p-1">
                {TASK_COLUMNS.map((col) => (
                  <button
                    key={col.status}
                    type="button"
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold transition duration-200 ${taskStatusClass(col.status, task.status === col.status)}`}
                    onClick={() => void setStatus(col.status)}
                  >
                    {TASK_STATUS_LABELS[col.status]}
                  </button>
                ))}
              </div>
              {app ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {task.status !== "done" && task.status !== "cancelled" && isAssignedByOther(task) && task.assignee_id === app.userId ? (
                    <Button size="sm" onClick={() => void setStatus("in_review")}>
                      Submit for review
                    </Button>
                  ) : null}
                  {task.status === "in_review" && canApproveReview(task, app.userId) ? (
                    <>
                      <Button size="sm" onClick={() => void setStatus("done")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void setStatus("in_progress")}>
                        Request changes
                      </Button>
                    </>
                  ) : null}
                  {task.status !== "done" && task.status !== "cancelled" && canCompleteDirectly(task, app.userId) ? (
                    <Button size="sm" onClick={() => void setStatus("done")}>
                      Mark done
                    </Button>
                  ) : null}
                  {task.status !== "done" && task.status !== "cancelled" && (app.userId === task.created_by || app.userId === task.assignee_id) ? (
                    <Button size="sm" variant="ghost" onClick={() => void setStatus("cancelled")}>
                      Cancel task
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="px-4 py-4">
              <Field label="Priority">
                <Select
                  value={taskPriority(task.priority)}
                  onChange={(e) => {
                    const priority = taskPriority(e.target.value);
                    setTask({ ...task, priority });
                    void saveTask({ priority });
                  }}
                >
                  {TASK_PRIORITIES.map((key) => (
                    <option key={key} value={key}>
                      {TASK_PRIORITY_LABELS[key]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="px-4 py-4">
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
            </div>
            <div className="px-4 py-4">
              <Field label="Requester">
                <p className="text-sm">{displayName(profiles[task.created_by])}</p>
              </Field>
            </div>
            <div className="px-4 py-4">
              <Field label="Reviewer">
                <Select
                  value={task.reviewer_id || ""}
                  onChange={(e) => {
                    const reviewer_id = e.target.value || null;
                    setTask({ ...task, reviewer_id });
                    void saveTask({ reviewer_id });
                  }}
                >
                  <option value="">{isAssignedByOther(task) ? "Requester (default)" : "None — mark done yourself"}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {displayName(m)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="px-4 py-4">
              <Field label="Due date">
                <DatePicker
                  value={dueDateKey(task.due_date)}
                  onChange={(due_date) => {
                    setTask({ ...task, due_date });
                    void saveTask({ due_date });
                  }}
                  placeholder="Pick a due date"
                />
              </Field>
            </div>
            <div className="px-4 py-4">
              <p className="mb-2 text-[12px] font-medium text-muted">Files</p>
              <FileDrop onFile={(file) => void uploadFile(file)} hint="Optional. Up to 8 MB each." />
              {files.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {files.map((file) => (
                    <li key={file.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 text-left text-sm transition duration-200 hover:border-border-strong"
                        onClick={() => void openFile(file)}
                      >
                        <FileText size={18} weight="light" className="shrink-0 text-teal" />
                        <span className="min-w-0 truncate">{file.file_name}</span>
                      </button>
                      <ConfirmDelete
                        label="Delete file"
                        title="Delete this file?"
                        onConfirm={() => deleteFile(file)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
