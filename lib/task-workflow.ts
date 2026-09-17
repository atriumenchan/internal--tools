import type { Task, TaskStatus } from "@/lib/types";

type TaskPeople = Pick<Task, "created_by" | "assignee_id" | "reviewer_id" | "status">;

export function isTerminalStatus(status: TaskStatus) {
  return status === "done" || status === "cancelled";
}

export function isAssignedByOther(task: Pick<TaskPeople, "created_by" | "assignee_id">) {
  return Boolean(task.assignee_id && task.assignee_id !== task.created_by);
}

export function effectiveReviewer(task: Pick<TaskPeople, "created_by" | "assignee_id" | "reviewer_id">) {
  if (task.reviewer_id) return task.reviewer_id;
  if (isAssignedByOther(task)) return task.created_by;
  return null;
}

export function canCompleteDirectly(task: Pick<TaskPeople, "created_by" | "assignee_id">, userId: string) {
  if (isAssignedByOther(task)) return false;
  return userId === task.created_by || userId === task.assignee_id;
}

export function canApproveReview(task: Pick<TaskPeople, "created_by" | "assignee_id" | "reviewer_id">, userId: string) {
  const reviewer = effectiveReviewer(task);
  return Boolean(reviewer && reviewer === userId);
}

export function applyTaskStatus(
  task: TaskPeople,
  next: TaskStatus,
  userId: string
): { status: TaskStatus; error?: string } {
  if (task.status === next) return { status: next };

  if (isTerminalStatus(task.status) && next !== task.status) {
    return { status: task.status, error: "Finished or cancelled work stays that way." };
  }

  if (next === "cancelled") {
    if (userId === task.created_by || userId === task.assignee_id) return { status: "cancelled" };
    return { status: task.status, error: "Only the requester or assignee can cancel." };
  }

  if (next === "done") {
    if (canCompleteDirectly(task, userId) || canApproveReview(task, userId)) return { status: "done" };
    if (isAssignedByOther(task) && userId === task.assignee_id) {
      if (task.status === "in_review") {
        return { status: "in_review", error: "This task needs reviewer approval before it can be marked done." };
      }
      return { status: "in_review" };
    }
    return { status: task.status, error: "This task needs reviewer approval before it can be marked done." };
  }

  if (next === "in_review") {
    if (userId === task.assignee_id || userId === task.created_by) return { status: "in_review" };
    return { status: task.status, error: "Only the assignee can submit this for review." };
  }

  return { status: next };
}

export function missingWorkflowColumn(message: string | null | undefined) {
  const m = (message || "").toLowerCase();
  return (
    (m.includes("reviewer_id") || m.includes("completion_criteria") || m.includes("in_review") || m.includes("cancelled")) &&
    (m.includes("column") || m.includes("enum") || m.includes("invalid input") || m.includes("schema cache") || m.includes("does not exist"))
  );
}
