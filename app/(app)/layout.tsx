import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
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
    .single();

  const { data: settings } = await supabase
    .from("company_settings")
    .select("company_name")
    .eq("id", 1)
    .maybeSingle();

  return (
    <AppShell
      profile={(profile as Profile) ?? { id: user.id, email: user.email ?? "", full_name: "", role: "hr" }}
      companyName={(settings as Pick<CompanySettings, "company_name"> | null)?.company_name ?? "Atrium"}
    >
      {children}
    </AppShell>
  );
}
