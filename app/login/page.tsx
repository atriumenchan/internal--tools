import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/utils";
import { ensureAdminFromEnv } from "@/lib/ensure-admin";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  await ensureAdminFromEnv();

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <section className="hidden flex-col justify-between bg-ink p-10 text-cream md:flex">
        <p className="font-serif text-2xl">Atrium</p>
        <div>
          <h1 className="font-serif text-5xl leading-tight">Letters that bind only when signed.</h1>
          <p className="mt-4 max-w-md text-cream/70">
            Create an offer, share a private link, and keep it unofficial until the candidate signs.
            Attendance from the biometric Excel sits beside it.
          </p>
        </div>
        <p className="text-sm text-cream/40">Internal tools · not a public site</p>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-terracotta">Staff access</p>
          <h2 className="font-serif text-3xl">Sign in</h2>
          <p className="mt-2 mb-8 text-sm text-ink-soft">HR and admin only. Candidates use the signing link.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
