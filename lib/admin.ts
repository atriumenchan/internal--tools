export function adminEmail() {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "ryan@admexo.com").trim().toLowerCase();
}

export function isAdminEmail(email: string | null | undefined) {
  return (email || "").trim().toLowerCase() === adminEmail();
}

export function isAdminUser(input: { email?: string | null; role?: string | null }) {
  return input.role === "admin" || isAdminEmail(input.email);
}
