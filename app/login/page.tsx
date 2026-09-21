import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/utils";
import { ensureAdminFromEnv } from "@/lib/ensure-admin";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  void ensureAdminFromEnv();

  return (
    <div className="grid min-h-screen bg-canvas md:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-page p-10 text-ink md:flex md:flex-col md:rounded-r-lg">
        <p className="font-display text-2xl font-medium tracking-tight">ADMEXO</p>
        <div className="flex flex-1 flex-col justify-center py-16">
          <h1 className="font-display max-w-md text-4xl font-medium leading-[1.12] tracking-tight">
            Tasks, chat, and attendance in one place.
          </h1>
          <p className="mt-4 max-w-md text-[15px] text-muted">
            Sign in with the login from Staff. You will see the handbook first if you have not signed it yet.
          </p>
        </div>
        <p className="text-sm text-faint">Internal · not a public site</p>
      </section>
      <section className="flex items-center justify-center bg-page px-6 py-16">
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-card">
          <h2 className="font-display text-[32px] font-medium tracking-tight">Sign in</h2>
          <p className="mt-2 mb-8 text-sm text-muted">Use your work email and the password from Staff.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
