import { isManagerUser } from "@/lib/roles";
import type { Task, TaskStatus } from "@/lib/types";

type TaskPeople = Pick<Task, "created_by" | "assignee_id" | "reviewer_id" | "status">;
type Actor = { id: string; email?: string | null; role?: string | null };

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

export function canManageTask(task: Pick<Task, "created_by">, actor: Actor | null | undefined) {
  if (!actor?.id) return false;
  if (actor.id === task.created_by) return true;
  return isManagerUser(actor);
}

export function canMoveTask(
  task: Pick<Task, "created_by" | "assignee_id">,
  actor: Actor | null | undefined
) {
  if (!actor?.id) return false;
  if (actor.id === task.created_by) return true;
  if (task.assignee_id && actor.id === task.assignee_id) return true;
  return isManagerUser(actor);
}

export function canManageSpace(
  space: { created_by: string | null | undefined },
  actor: Actor | null | undefined
) {
  if (!actor?.id) return false;
  if (space.created_by && actor.id === space.created_by) return true;
  return isManagerUser(actor);
}

export function canCompleteDirectly(task: Pick<TaskPeople, "created_by" | "assignee_id">, userId: string) {
  return userId === task.created_by;
}

export function canApproveReview(task: Pick<TaskPeople, "created_by" | "assignee_id" | "reviewer_id">, userId: string) {
  return userId === task.created_by;
}

export function applyTaskStatus(
  task: TaskPeople,
  next: TaskStatus,
  userId: string,
  actor?: Omit<Actor, "id"> | null
): { status: TaskStatus; error?: string } {
  if (task.status === next) return { status: next };
  const allowed =
    userId === task.created_by || userId === task.assignee_id || isManagerUser({ email: actor?.email, role: actor?.role });
  if (!allowed) {
    return {
      status: task.status,
      error: "Only the requester, the assignee, or a manager can move this task.",
    };
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
