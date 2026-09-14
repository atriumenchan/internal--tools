import { isSupabaseConfigured } from "@/lib/utils";
import { TextLink } from "@/components/ui";

export default function SetupPage() {
  const configured = isSupabaseConfigured();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.2em] text-terracotta">Setup</p>
      <h1 className="mt-2 font-serif text-4xl">Connect Supabase, then come back</h1>
      <p className="mt-3 text-ink-soft">
        The app is ready. Create a Supabase project, run <code className="text-ink">supabase/schema.sql</code> then{" "}
        <code className="text-ink">supabase/spaces.sql</code>, then put the project URL and anon key in{" "}
        <code className="text-ink">.env.local</code>.
      </p>

      {configured ? (
        <p className="mt-6 rounded-2xl bg-sage-soft px-4 py-3 text-sm text-sage">
          Keys look present. Go to <TextLink href="/login">sign in</TextLink>.
        </p>
      ) : (
        <ol className="mt-8 list-decimal space-y-4 pl-5 text-sm leading-6 text-ink-soft">
          <li>
            Create a project at{" "}
            <a className="text-terracotta underline" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
              supabase.com/dashboard
            </a>
            .
          </li>
          <li>
            Open <strong>SQL Editor</strong>, paste the entire contents of{" "}
            <code className="text-ink">supabase/schema.sql</code>, run it, then do the same with{" "}
            <code className="text-ink">supabase/spaces.sql</code>.
          </li>
          <li>
            Copy Project URL and anon public key from Settings → API into{" "}
            <code className="text-ink">.env.local</code>:
            <pre className="mt-2 overflow-x-auto rounded-xl bg-ink p-4 text-xs text-cream">{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000`}</pre>
          </li>
          <li>Enable Email auth (password) in Authentication → Providers.</li>
          <li>Restart the app, then create the first account — it becomes admin.</li>
        </ol>
      )}
    </div>
  );
}
