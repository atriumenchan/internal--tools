import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/utils";
import { ensureAdminFromEnv } from "@/lib/ensure-admin";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  void ensureAdminFromEnv();

  return (
    <div className="grid min-h-screen bg-page md:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
      <section className="relative hidden flex-col border-r border-ink bg-canvas px-12 py-12 md:flex">
        <p className="font-editorial text-[15px] italic text-amber">For the office</p>
        <div className="mt-16">
          <h1 className="font-editorial text-[4.5rem] leading-[0.9] tracking-[-0.03em]">ADMEXO</h1>
          <p className="font-editorial mt-3 text-[1.75rem] italic leading-none text-amber">Workspace</p>
          <p className="mt-8 max-w-[28ch] text-[13px] leading-5 text-muted">
            Tasks, chat, attendance, and the handbook. Sign in with the login from Staff.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[22rem]">
          <h2 className="text-[32px] leading-[38px] font-bold tracking-[-0.03em]">Sign in</h2>
          <p className="mt-2 mb-8 text-[13px] leading-5 text-muted">
            Use the work email and password from Staff. The handbook comes first if you have not signed it.
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
