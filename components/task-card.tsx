"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import { displayName, TASK_STATUS_LABELS } from "@/lib/spaces";
import { formatDueDate, isOverdue } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Profile, Task, TaskStatus } from "@/lib/types";

export function taskBadgeTone(task: Pick<Task, "status" | "due_date">) {
  if (task.status === "done") return "ok" as const;
  if (isOverdue(task.due_date, task.status)) return "danger" as const;
  if (task.status === "in_progress") return "info" as const;
  return "neutral" as const;
}

export function taskStatusClass(status: TaskStatus, active = false) {
  if (status === "done") {
    return active
      ? "bg-success/15 text-success ring-1 ring-success/30"
      : "text-muted hover:bg-success/10 hover:text-success";
  }
  if (status === "in_progress") {
    return active
      ? "bg-blue/15 text-blue-soft ring-1 ring-blue/30"
      : "text-muted hover:bg-blue/10 hover:text-blue-soft";
  }
  return active
    ? "bg-white/[0.08] text-ink ring-1 ring-rule"
    : "text-muted hover:bg-white/5 hover:text-ink";
}

export function TaskCard({
  task,
  href,
  spaceName,
  assignee,
  onAdvance,
}: {
  task: Task;
  href: string;
  spaceName?: string;
  assignee?: Profile | null;
  onAdvance?: () => void;
}) {
  const due = formatDueDate(task.due_date);
  const late = isOverdue(task.due_date, task.status);

  return (
    <Link
      href={href}
      className="block rounded-[12px] border border-rule bg-elevated p-3.5 shadow-card transition duration-200 hover:border-line-hover hover:bg-cream"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug text-ink">{task.title}</p>
        {onAdvance ? (
          <button
            type="button"
            className="shrink-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAdvance();
            }}
            title="Move to the next column"
          >
            <Badge tone={taskBadgeTone(task)}>{TASK_STATUS_LABELS[task.status]}</Badge>
          </button>
        ) : (
          <Badge tone={taskBadgeTone(task)}>{TASK_STATUS_LABELS[task.status]}</Badge>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
        {spaceName ? <span>{spaceName}</span> : null}
        <span>{assignee ? displayName(assignee) : "Unassigned"}</span>
        {due ? <span className={cn(late && "font-medium text-danger")}>{late ? `Overdue · ${due}` : due}</span> : null}
      </div>
    </Link>
  );
}
