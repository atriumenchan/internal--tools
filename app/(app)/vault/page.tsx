"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, ErrorText, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageFallback } from "@/components/app-nav";
import type { CompanyCredential } from "@/lib/types";

export default function VaultPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [rows, setRows] = useState<CompanyCredential[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data, error: err } = await supabase.from("company_credentials").select("*").order("title");
    if (err) {
      setError(
        err.message.includes("does not exist") || err.message.includes("schema cache")
          ? "Vault is not set up yet. Paste supabase/workspace-plus.sql in the Supabase SQL editor."
          : err.message
      );
      setRows([]);
      return;
    }
    setError(null);
    setRows((data ?? []) as CompanyCredential[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = formRef.current;
    if (!formEl) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const form = new FormData(formEl);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setError("Sign in again, then save.");
      return;
    }
    const payload = {
      title: String(form.get("title") || "").trim(),
      username: String(form.get("username") || "").trim() || null,
      secret: String(form.get("secret") || "").trim() || null,
      url: String(form.get("url") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null,
      created_by: user.id,
    };
    if (!payload.title) {
      setBusy(false);
      setError("Give this login a name.");
      return;
    }
    const { data, error: err } = await supabase.from("company_credentials").insert(payload).select("*").single();
    setBusy(false);
    if (err || !data) {
      setError(
        err?.message.includes("row-level security") || err?.message.includes("policy")
          ? "Could not save. Paste supabase/private-credentials.sql in the Supabase SQL editor, then try again."
          : err?.message || "Could not save this login."
      );
      return;
    }
    formEl.reset();
    setRows((prev) => [data as CompanyCredential, ...(prev ?? [])]);
    setNotice("Saved. Only you can see this row.");
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error: err } = await supabase.from("company_credentials").delete().eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    setRows((prev) => (prev ?? []).filter((row) => row.id !== id));
  }

  async function copySecret(id: string, secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(id);
      window.setTimeout(() => setCopied((cur) => (cur === id ? null : cur)), 1600);
    } catch {
      setError("Could not copy.");
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Private"
        title="Your credentials"
        description="Only you can see what you save here. Other staff cannot, and admin cannot see your rows in the app."
      />
      <p className="mb-6 rounded-[10px] border border-rule bg-surface px-5 py-3 text-[13px] text-ink-soft shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]">
        Use this for logins you personally need (TeamOffice, ads accounts, domain panels). Do not put personal banking
        passwords here.
      </p>
      <ErrorText className="mb-4">{error}</ErrorText>
      {notice ? <p className="mb-4 text-[13px] text-success">{notice}</p> : null}
      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        <form ref={formRef} onSubmit={add} className="space-y-3">
          <Card>
            <h2 className="text-[18px] font-semibold tracking-tight">Add a record</h2>
            <div className="mt-4 space-y-3">
              <Field label="What is this" htmlFor="vault-title">
                <Input id="vault-title" name="title" required placeholder="Meta ads, Google Workspace…" />
              </Field>
              <Field label="Username / email" htmlFor="vault-user">
                <Input id="vault-user" name="username" autoComplete="off" />
              </Field>
              <Field label="Password or key" htmlFor="vault-secret">
                <Input id="vault-secret" name="secret" type="password" autoComplete="off" />
              </Field>
              <Field label="URL" htmlFor="vault-url">
                <Input id="vault-url" name="url" placeholder="https://" />
              </Field>
              <Field label="Notes" htmlFor="vault-notes">
                <Textarea id="vault-notes" name="notes" rows={3} />
              </Field>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </Card>
        </form>
        <div className="space-y-4">
          {rows === null ? (
            <PageFallback />
          ) : rows.length === 0 ? (
            <EmptyState>No credentials saved yet. Add one on the left.</EmptyState>
          ) : (
            rows.map((row) => (
              <Card key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold tracking-tight">{row.title}</h3>
                    {row.username ? <p className="mt-1 text-[13px] text-ink-soft">{row.username}</p> : null}
                    {row.url ? (
                      <a
                        href={row.url}
                        className="mt-1 inline-block text-[13px] font-medium text-blue-soft hover:text-blue"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.url}
                      </a>
                    ) : null}
                  </div>
                  <ConfirmDelete
                    label="Delete login"
                    title="Delete this saved login?"
                    onConfirm={() => remove(row.id)}
                  />
                </div>
                {row.secret ? (
                  <div className="mt-3 flex items-center gap-2 rounded-[10px] bg-input px-3 py-2 font-mono text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{shown[row.id] ? row.secret : "••••••••••••"}</span>
                    <button
                      type="button"
                      className="rounded-[6px] p-1.5 text-muted hover:bg-white/[0.06] hover:text-ink"
                      aria-label={shown[row.id] ? "Hide password" : "Show password"}
                      onClick={() => setShown((s) => ({ ...s, [row.id]: !s[row.id] }))}
                    >
                      {shown[row.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button
                      type="button"
                      className="rounded-[6px] p-1.5 text-muted hover:bg-white/[0.06] hover:text-ink"
                      aria-label="Copy password"
                      onClick={() => void copySecret(row.id, row.secret || "")}
                    >
                      {copied === row.id ? <Check size={15} className="text-success" /> : <Copy size={15} />}
                    </button>
                    {copied === row.id ? <span className="text-[12px] font-sans text-success">Copied</span> : null}
                  </div>
                ) : null}
                {row.notes ? <p className="mt-2 text-[13px] text-ink-soft">{row.notes}</p> : null}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
