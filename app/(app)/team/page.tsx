import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { TeamPanel } from "./team-panel";
import { isAdminUser } from "@/lib/admin";
import { ensureAdminFromEnv } from "@/lib/ensure-admin";

export default async function TeamPage() {
  await ensureAdminFromEnv();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user!.id).maybeSingle();
  if (!isAdminUser({ email: user?.email ?? profile?.email, role: profile?.role })) {
    redirect("/dashboard");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Access"
        title="Staff accounts"
        description="Create logins from here. People you add can sign in immediately — they do not register themselves."
      />
      <TeamPanel />
    </div>
  );
}
