import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/utils";
import { ensureAdminFromEnv } from "@/lib/ensure-admin";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  void ensureAdminFromEnv();

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-sidebar p-10 text-ink md:flex md:flex-col">
        <div className="absolute inset-y-0 left-0 w-1 bg-terracotta" />
        <p className="text-2xl font-semibold tracking-tight">ADMEXO</p>
        <div className="flex flex-1 flex-col justify-center py-16">
          <h1 className="max-w-md text-4xl font-semibold leading-[1.12] tracking-tight">
            Tasks, chat, and attendance in one place.
          </h1>
          <p className="mt-4 max-w-md text-[15px] text-ink-soft">
            Sign in with the login from Staff. You will see the handbook first if you have not signed it yet.
          </p>
        </div>
        <p className="text-sm text-muted">Internal · not a public site</p>
      </section>
      <section className="flex items-center justify-center bg-paper px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Staff access</p>
          <h2 className="text-[32px] font-semibold tracking-tight">Sign in</h2>
          <p className="mt-2 mb-8 text-sm text-ink-soft">Use your work email and the password from Staff.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
