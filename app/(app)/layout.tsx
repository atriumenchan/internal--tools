import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { isSupabaseConfigured } from "@/lib/utils";
import type { CompanySettings, Profile } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) redirect("/setup");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (isAdminEmail(user.email) && profile && profile.role !== "admin") {
    await supabase.from("profiles").update({ role: "admin" }).eq("id", user.id);
    profile.role = "admin";
  }

  const { data: settings } = await supabase
    .from("company_settings")
    .select("company_name")
    .eq("id", 1)
    .maybeSingle();

  const resolved: Profile = (profile as Profile) ?? {
    id: user.id,
    email: user.email ?? "",
    full_name: "",
    role: isAdminEmail(user.email) ? "admin" : "hr",
  };

  return (
    <AppShell
      profile={resolved}
      companyName={(settings as Pick<CompanySettings, "company_name"> | null)?.company_name ?? "Atrium"}
    >
      {children}
    </AppShell>
  );
}
