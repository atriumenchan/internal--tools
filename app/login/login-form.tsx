"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, ErrorText, Field, Input } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
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
      sessionStorage.removeItem("it-shell-v3");
      sessionStorage.removeItem("it-shell-v4");
      sessionStorage.removeItem("it-shell-v5");
      sessionStorage.removeItem("it-workspace-v1");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(
        /invalid login credentials/i.test(err instanceof Error ? err.message : "")
          ? "Email or password is wrong."
          : err instanceof Error
            ? err.message
            : "Could not sign in"
      );
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
      <Field label="Work email" htmlFor="login-email">
        <Input
          id="login-email"
          type="email"
          autoComplete="username"
          placeholder="you@admexo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      <Field label="Password" htmlFor="login-password">
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
      </Field>
      {linkExpired ? (
        <ErrorText>
          That email link has expired. Ask Ryan to create your account, then sign in here with the password they gave you.
        </ErrorText>
      ) : authError ? (
        <ErrorText>{authError.replace(/\+/g, " ")}</ErrorText>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : "Sign in"}
      </Button>
      <p className="text-center text-xs text-muted">Ask Ryan if you need an account.</p>
    </form>
  );
}
