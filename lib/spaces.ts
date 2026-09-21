import type { Profile, TaskPriority, TaskStatus } from "@/lib/types";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "To do",
  in_progress: "Doing",
  in_review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};

export const TASK_COLUMNS: { status: TaskStatus; hint: string; accent: string; column: string }[] = [
  { status: "open", hint: "Not started", accent: "bg-muted", column: "border-border bg-surface" },
  { status: "in_progress", hint: "In motion", accent: "bg-amber", column: "border-border bg-surface" },
  { status: "in_review", hint: "Needs a yes", accent: "bg-violet", column: "border-border bg-surface" },
  { status: "done", hint: "Finished", accent: "bg-teal", column: "border-border bg-surface" },
];

export const PRIORITY_BAR: Record<TaskPriority, string> = {
  low: "bg-muted",
  medium: "bg-amber",
  high: "bg-coral",
  urgent: "bg-coral",
};

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function taskPriority(value: string | null | undefined): TaskPriority {
  if (value === "low" || value === "high" || value === "urgent") return value;
  return "medium";
}

export const SPACE_COLORS = ["#FF5A1F", "#3B82F6", "#22C55E", "#A855F7", "#EAB308", "#F43F5E"];

export function canCreateSpace(
  profile: Pick<Profile, "role"> | null | undefined,
  anyoneCanCreateSpaces: boolean
) {
  return Boolean(anyoneCanCreateSpaces || profile?.role === "admin");
}

export function displayName(profile: Pick<Profile, "full_name" | "email"> | undefined | null) {
  if (!profile) return "Someone";
  return profile.full_name?.trim() || profile.email || "Someone";
}

export function initials(profile: Pick<Profile, "full_name" | "email"> | undefined | null) {
  const name = displayName(profile);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function nextTaskStatus(status: TaskStatus): TaskStatus {
  if (status === "open") return "in_progress";
  if (status === "in_progress") return "in_review";
  if (status === "in_review") return "done";
  return "open";
}

export function missingPriorityColumn(message: string | null | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("priority") && (m.includes("column") || m.includes("schema cache") || m.includes("does not exist"));
}

export function missingSpacesSchema(message: string | null | undefined) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("could not find the table") ||
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("could not find the function")
  );
}
