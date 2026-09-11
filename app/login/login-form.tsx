"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const authError = params.get("error") || params.get("error_description");
  const errorCode = params.get("error_code");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const origin = window.location.origin;
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${origin}/auth/callback`,
          },
        });
        if (err) throw err;
        if (data.session) {
          router.push(next);
          router.refresh();
          return;
        }
        setInfo("Check your inbox if confirmation is enabled. Prefer: in Supabase, turn off Confirm email, then sign in here.");
        setMode("signin");
        return;
      }
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not authenticate");
    } finally {
      setBusy(false);
    }
  }

  const linkExpired =
    errorCode === "otp_expired" ||
    (authError ?? "").toLowerCase().includes("expired") ||
    (authError ?? "").toLowerCase().includes("invalid");

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "signup" ? (
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
      ) : null}
      <Field label="Work email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
      </Field>
      {linkExpired ? (
        <p className="text-sm text-red-800">
          That email link has expired or already been used, and it pointed at localhost. Ignore it.
          Turn off Confirm email in Supabase, then sign in with your password on this page.
        </p>
      ) : authError ? (
        <p className="text-sm text-red-800">{authError.replace(/\+/g, " ")}</p>
      ) : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      {info ? <p className="text-sm text-sage">{info}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-ink-soft">
        {mode === "signin" ? "First person here?" : "Already have access?"}{" "}
        <button
          type="button"
          className="text-terracotta underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Create the admin account" : "Sign in"}
        </button>
      </p>
    </form>
  );
}
