import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isAdminUser } from "@/lib/admin";
import type { Profile } from "@/lib/types";

export const getServerSupabase = cache(async () => createClient());

export const getAppShell = cache(async () => {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: linked }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role").eq("id", user.id).maybeSingle(),
    supabase.from("employees").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("company_settings").select("company_name").eq("id", 1).maybeSingle(),
  ]);

  if (isAdminEmail(user.email) && profile && profile.role !== "admin") {
    void supabase.from("profiles").update({ role: "admin" }).eq("id", user.id);
    profile.role = "admin";
  }

  const resolved: Profile = (profile as Profile) ?? {
    id: user.id,
    email: user.email ?? "",
    full_name: "",
    role: isAdminEmail(user.email) ? "admin" : "hr",
  };

  return {
    supabase,
    user,
    profile: resolved,
    operator: isAdminUser({ email: user.email, role: resolved.role }) || !linked,
    companyName: (settings as { company_name?: string } | null)?.company_name ?? "Atrium",
  };
});
