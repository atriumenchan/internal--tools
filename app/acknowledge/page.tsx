"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";
import { SignaturePad } from "@/components/signature-pad";
import { isAdminEmail } from "@/lib/admin";
import { mustSignHandbook, HANDBOOK_PDF } from "@/lib/handbook";

export default function AcknowledgePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState("2.0");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        router.replace("/login?next=/acknowledge");
        return;
      }
      const [{ data: profile }, { data: settings }] = await Promise.all([
        supabase.from("profiles").select("full_name, handbook_version, role, email").eq("id", user.id).maybeSingle(),
        supabase.from("company_settings").select("handbook_version").eq("id", 1).maybeSingle(),
      ]);
      const required = (settings as { handbook_version?: string } | null)?.handbook_version || "2.0";
      setVersion(required);
      const row = profile as {
        full_name?: string;
        handbook_version?: string;
        role?: string;
        email?: string;
      } | null;
      setName(row?.full_name || "");
      if (
        !mustSignHandbook({
          role: row?.role,
          email: row?.email || user.email,
          handbookVersion: row?.handbook_version,
          requiredVersion: required,
        }) ||
        isAdminEmail(user.email)
      ) {
        router.replace("/dashboard");
        return;
      }
      setReady(true);
    })();
  }, [router]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    sessionStorage.removeItem("it-shell-v2");
    sessionStorage.removeItem("it-shell-v3");
    router.push("/login");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!signature) {
      setError("Type your name and pick a signature style.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    let ip: string | null = null;
    try {
      const res = await fetch("/api/client-ip");
      if (res.ok) {
        const body = (await res.json()) as { ip?: string | null };
        ip = body.ip ?? null;
      }
    } catch {
      ip = null;
    }
    const { data, error: err } = await supabase.rpc("acknowledge_handbook", {
      p_signer_name: name,
      p_signature_data: signature,
      p_ip: ip,
    });
    if (err) {
      setError(
        err.message.includes("could not find") || err.message.includes("schema cache")
          ? "Handbook signing is not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      setBusy(false);
      return;
    }
    if (data && (data as { ok?: boolean }).ok === false) {
      setError("Could not save your acknowledgement.");
      setBusy(false);
      return;
    }
    sessionStorage.removeItem("it-shell-v2");
    sessionStorage.removeItem("it-shell-v3");
    router.replace("/dashboard");
    router.refresh();
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-sm text-ink-soft">
        Loading handbook…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b border-border bg-page px-5 py-4">
        <div>
          <p className="font-display text-xl font-medium tracking-tight">ADMEXO</p>
          <p className="text-[11px] text-faint">Handbook v{version}</p>
        </div>
        <button onClick={signOut} className="text-sm text-muted hover:text-ink">
          Sign out
        </button>
      </header>
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h1 className="font-display text-[32px] font-medium tracking-tight md:text-[40px]">Read and sign the handbook</h1>
          <p className="mt-2 text-sm text-muted">
            Everyone signs once for this version before Spaces, Chat, and the rest of the internal tools.
          </p>
          <iframe
            title="ADMEXO handbook"
            src={HANDBOOK_PDF}
            className="mt-6 min-h-[70vh] w-full rounded-md border border-border bg-surface shadow-card"
          />
          <a href={HANDBOOK_PDF} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-teal hover:text-teal-soft">
            Open PDF in a new tab
          </a>
        </div>
        <form onSubmit={submit} className="h-fit space-y-4 rounded-md border border-border bg-surface p-5 shadow-card">
          <h2 className="font-display text-xl font-medium">Confirm</h2>
          <p className="text-sm text-muted">
            I have read the ADMEXO employee & intern handbook v{version} and agree to follow it.
          </p>
          <Field label="Type your name as you spell it">
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </Field>
          <Field label="Signature style">
            <SignaturePad name={name} onChange={setSignature} />
          </Field>
          {error ? <p className="text-sm text-coral">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Sign and continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
