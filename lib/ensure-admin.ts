import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_DISPLAY_NAME, adminEmail } from "@/lib/admin";

let attempted = false;

/** Creates the env admin in Supabase Auth if missing. Password lives only in server env. */
export async function ensureAdminFromEnv() {
  if (attempted) return;
  attempted = true;

  const email = adminEmail();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 6) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return;

    const existing = data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (existing) {
      await admin
        .from("profiles")
        .update({ role: "admin", email, full_name: ADMIN_DISPLAY_NAME })
        .eq("id", existing.id);
      return;
    }

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: ADMIN_DISPLAY_NAME, role: "admin" },
    });
    if (created.data.user) {
      await admin
        .from("profiles")
        .update({ role: "admin", full_name: ADMIN_DISPLAY_NAME, email })
        .eq("id", created.data.user.id);
    }
  } catch {
    attempted = false;
  }
}
