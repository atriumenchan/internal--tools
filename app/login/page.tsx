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
      <section className="hidden flex-col justify-between bg-black p-10 text-ink md:flex">
        <p className="text-2xl font-semibold tracking-tight">ADMEXO</p>
        <div>
          <h1 className="text-5xl font-semibold leading-tight">Work, chat, and attendance — after you sign the handbook.</h1>
          <p className="mt-4 max-w-md text-ink-soft">
            Spaces and tasks for the team. Chat with each other. Attendance and offer letters sit beside it.
          </p>
        </div>
        <p className="text-sm text-ink-soft">Internal · not a public site</p>
      </section>
      <section className="flex items-center justify-center bg-paper px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-terracotta">Staff access</p>
          <h2 className="text-3xl font-semibold">Sign in</h2>
          <p className="mt-2 mb-8 text-sm text-ink-soft">Accounts are created by an admin. Candidates use the signing link.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
