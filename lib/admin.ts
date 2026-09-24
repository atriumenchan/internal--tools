export function normalizeEmpCode(code: string | null | undefined) {
  return (code || "").trim().replace(/^0+/, "") || "0";
}

export function isIgnoredEmployee(code?: string | null, name?: string | null) {
  const n = (name || "").trim().toLowerCase();
  if (n === "ryan ray" || n === "ryan") return true;
  return normalizeEmpCode(code) === "3";
}

export function adminEmail() {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "ryan@admexo.com")
    .trim()
    .toLowerCase();
}

export function isAdminEmail(email: string | null | undefined) {
  return (email || "").trim().toLowerCase() === adminEmail();
}

export function isAdminUser(input: { email?: string | null; role?: string | null }) {
  return input.role === "admin" || isAdminEmail(input.email);
}

export const ADMIN_DISPLAY_NAME = "Ryan";
