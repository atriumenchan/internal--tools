import { ADMIN_DISPLAY_NAME, isAdminEmail, isAdminUser } from "@/lib/admin";
import type { AppRole, Profile } from "@/lib/types";

export type WorkspaceRole = "admin" | "manager" | "employee";

export const WORKSPACE_ROLES: WorkspaceRole[] = ["employee", "manager", "admin"];

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  employee: "Employee",
  manager: "Manager",
  admin: ADMIN_DISPLAY_NAME,
};

export function parseAppRole(value: string | null | undefined): AppRole {
  if (value === "admin" || value === "manager" || value === "employee" || value === "hr") return value;
  return "employee";
}

export function workspaceRole(input: { email?: string | null; role?: string | null } | null | undefined): WorkspaceRole {
  if (!input) return "employee";
  if (isAdminUser(input)) return "admin";
  if (input.role === "manager" || input.role === "hr") return "manager";
  return "employee";
}

export function isManagerUser(input: { email?: string | null; role?: string | null } | null | undefined) {
  const role = workspaceRole(input);
  return role === "admin" || role === "manager";
}

export function canPublishKnowledge(profile: Pick<Profile, "email" | "role"> | null | undefined) {
  return isManagerUser(profile);
}

export function isProtectedAdmin(email: string | null | undefined) {
  return isAdminEmail(email);
}
