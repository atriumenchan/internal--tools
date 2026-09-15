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
      router.replace("/home");
    }
  }, [app, router]);

  if (!app) return <PageFallback />;
  if (!isAdminUser({ email: app.profile.email, role: app.profile.role })) return <PageFallback />;

  return (
    <div>
      <PageHeader
        eyebrow="Access"
        title="Staff accounts"
        description="Create, reset, or delete staff logins. On each person: Reset password, or Delete then pick them on the left to make a new email and password. Your admin login cannot be deleted or reset here — that password is ADMIN_PASSWORD in Vercel."
      />
      <TeamPanel />
    </div>
  );
}
