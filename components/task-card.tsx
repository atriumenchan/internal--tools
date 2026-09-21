"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { DotsSixVertical } from "@phosphor-icons/react/dist/ssr/DotsSixVertical";
import { PencilSimple } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { Badge } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Avatar } from "@/components/avatar";
import { TaskForm, draftFromTask, type TaskDraft } from "@/components/task-form";
import {
  displayName,
  TASK_COLUMNS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  taskPriority,
} from "@/lib/spaces";
import { formatDueDate, isOverdue } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Profile, Task, TaskPriority, TaskStatus } from "@/lib/types";

export function taskBadgeTone(task: Pick<Task, "status" | "due_date">) {
  if (task.status === "done") return "ok" as const;
  if (task.status === "cancelled") return "neutral" as const;
  if (isOverdue(task.due_date, task.status)) return "danger" as const;
  if (task.status === "in_review") return "review" as const;
  if (task.status === "in_progress") return "accent" as const;
  return "neutral" as const;
}

export function taskStatusClass(status: TaskStatus, active = false) {
  if (status === "done") {
    return active ? "bg-teal-dim text-teal" : "text-muted hover:text-teal hover:bg-teal-dim";
  }
  if (status === "in_review") {
    return active ? "bg-violet-dim text-violet" : "text-muted hover:text-violet hover:bg-violet-dim";
  }
  if (status === "in_progress") {
    return active ? "bg-amber-dim text-amber" : "text-muted hover:text-amber hover:bg-amber-dim";
  }
  if (status === "cancelled") {
    return active ? "bg-surface text-muted" : "text-muted hover:text-ink hover:bg-surface";
  }
  return active ? "bg-surface text-ink" : "text-muted hover:text-ink hover:bg-surface";
}

export function priorityTone(value: TaskPriority | string | null | undefined): "neutral" | "info" | "warn" | "danger" {
  const key = taskPriority(value);
  if (key === "urgent") return "danger";
  if (key === "high") return "danger";
  if (key === "low") return "neutral";
  return "warn";
}

export function TaskCard({
  task,
  href,
  spaceName,
  assignee,
  members,
  onMove,
  onEdit,
  onDelete,
}: {
  task: Task;
  href: string;
  spaceName?: string;
  assignee?: Profile | null;
  members?: Profile[];
  onMove?: (status: TaskStatus) => void;
  onEdit?: (values: TaskDraft) => Promise<boolean>;
  onDelete?: () => Promise<void> | void;
}) {
  const due = formatDueDate(task.due_date);
  const late = isOverdue(task.due_date, task.status);
  const priority = taskPriority(task.priority);
  const dragged = useRef(false);
  const note = (task.description || "").trim();
  const [editing, setEditing] = useState(false);
  const [lifting, setLifting] = useState(false);

  if (editing && onEdit && members) {
    return (
      <TaskForm
        members={members}
        initial={draftFromTask(task)}
        submitLabel="Save"
        busyLabel="Saving…"
        onCancel={() => setEditing(false)}
        onSubmit={async (values) => {
          const ok = await onEdit(values);
          if (ok) setEditing(false);
          return ok;
        }}
      />
    );
  }

  return (
    <article
      draggable={Boolean(onMove) && !editing}
      onDragStart={(e) => {
        if (!onMove) return;
        dragged.current = true;
        setLifting(true);
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => {
        setLifting(false);
        window.setTimeout(() => {
          dragged.current = false;
        }, 50);
      }}
      className={cn(
        "relative overflow-hidden rounded-md border border-border bg-surface-2 p-4 shadow-card",
        "border-l-[3px] transition-[box-shadow,transform,opacity] duration-200 ease-out motion-reduce:transition-none",
        task.status === "done" && "border-l-teal",
        task.status === "in_review" && "border-l-violet",
        task.status === "in_progress" && "border-l-amber",
        task.status !== "done" && task.status !== "in_review" && task.status !== "in_progress" && "border-l-muted",
        onMove && "cursor-grab active:cursor-grabbing",
        lifting && "rotate-1 scale-[1.02] opacity-80 shadow-float motion-reduce:rotate-0 motion-reduce:scale-100"
      )}
    >
      <div className="flex items-start gap-2">
        {onMove ? (
          <span className="mt-1 shrink-0 text-muted" title="Drag to move" aria-label="Drag to move">
            <DotsSixVertical size={18} weight="light" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={href}
              title={task.title}
              onClick={(e) => {
                if (dragged.current) e.preventDefault();
              }}
              className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-ink hover:text-teal"
            >
              {task.title}
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              {onDelete ? (
                <ConfirmDelete
                  label="Delete task"
                  title="Delete this task?"
                  description="The task, comments, and files will be removed."
                  onConfirm={onDelete}
                  extra={
                    onEdit
                      ? [
                          {
                            label: "Edit task",
                            icon: <PencilSimple size={18} weight="light" />,
                            onSelect: () => setEditing(true),
                          },
                        ]
                      : undefined
                  }
                />
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-soft">
            <Badge tone={priorityTone(priority)} dot>
              {TASK_PRIORITY_LABELS[priority]}
            </Badge>
            {spaceName ? <span className="text-muted">{spaceName}</span> : null}
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={assignee ? displayName(assignee) : "Unassigned"} size="sm" className="h-5 w-5 text-[9px]" />
              {assignee ? displayName(assignee) : "Unassigned"}
            </span>
            {due ? <span className={cn("font-mono text-[12px]", late && "font-medium text-coral")}>{late ? `Overdue · ${due}` : due}</span> : null}
          </div>
          {note ? <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">{note}</p> : null}
          {onMove ? (
            <div className="mt-3 grid grid-cols-4 gap-0.5 rounded-sm bg-surface p-1">
              {TASK_COLUMNS.map((col) => (
                <button
                  key={col.status}
                  type="button"
                  title={`Move to ${TASK_STATUS_LABELS[col.status]}`}
                  className={cn(
                    "rounded-sm px-1 py-1.5 text-[11px] font-medium transition duration-150",
                    taskStatusClass(col.status, task.status === col.status)
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (task.status !== col.status) onMove(col.status);
                  }}
                >
                  {TASK_STATUS_LABELS[col.status]}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2.5">
              <Badge tone={taskBadgeTone(task)} dot>
                {TASK_STATUS_LABELS[task.status]}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
