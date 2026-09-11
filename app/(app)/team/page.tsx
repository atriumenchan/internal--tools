import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { TeamPanel } from "./team-panel";
import { getAppShell } from "@/lib/app-shell-data";
import { isAdminUser } from "@/lib/admin";

export default async function TeamPage() {
  const shell = await getAppShell();
  if (!shell || !isAdminUser({ email: shell.user.email, role: shell.profile.role })) {
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
