"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { TeamPanel } from "./team-panel";
import { useAppState } from "@/components/app-frame";
import { isAdminUser } from "@/lib/admin";
import { PageFallback } from "@/components/app-nav";

export default function TeamPage() {
  const app = useAppState();
  const router = useRouter();

  useEffect(() => {
    if (app && !isAdminUser({ email: app.profile.email, role: app.profile.role })) {
      router.replace("/dashboard");
    }
  }, [app, router]);

  if (!app) return <PageFallback />;
  if (!isAdminUser({ email: app.profile.email, role: app.profile.role })) return <PageFallback />;

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
