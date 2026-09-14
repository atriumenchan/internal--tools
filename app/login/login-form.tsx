"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/spaces";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const authError = params.get("error") || params.get("error_description");
  const errorCode = params.get("error_code");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      sessionStorage.removeItem("it-shell-v1");
      sessionStorage.removeItem("it-shell-v2");
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
      <Field label="Work email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
      </Field>
      {linkExpired ? (
        <p className="text-sm text-red-800">
          That email link has expired. Ask an admin to create your account, then sign in here with the password they gave you.
        </p>
      ) : authError ? (
        <p className="text-sm text-red-800">{authError.replace(/\+/g, " ")}</p>
      ) : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : "Sign in"}
      </Button>
      <p className="text-center text-xs text-ink-soft">Accounts are created by an admin. There is no public sign-up.</p>
    </form>
  );
}
