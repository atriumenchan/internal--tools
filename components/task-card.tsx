"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import { displayName, TASK_STATUS_LABELS } from "@/lib/spaces";
import { formatDueDate, isOverdue } from "@/lib/datetime";
import type { Profile, Task } from "@/lib/types";

export function taskBadgeTone(task: Pick<Task, "status" | "due_date">) {
  if (task.status === "done") return "ok" as const;
  if (isOverdue(task.due_date, task.status)) return "danger" as const;
  if (task.status === "in_progress") return "info" as const;
  return "neutral" as const;
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
      className="block rounded-xl border border-rule bg-paper p-3 transition hover:border-white/20 hover:bg-white/[0.03]"
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
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-soft">
        {spaceName ? <span>{spaceName}</span> : null}
        <span>{assignee ? displayName(assignee) : "Unassigned"}</span>
        {due ? <span className={late ? "font-medium text-red-400" : ""}>{late ? `Overdue · ${due}` : due}</span> : null}
      </div>
    </Link>
  );
}
