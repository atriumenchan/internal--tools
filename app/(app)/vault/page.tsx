"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import type { CompanyCredential } from "@/lib/types";

export default function VaultPage() {
  const app = useAppState();
  const [rows, setRows] = useState<CompanyCredential[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<string, boolean>>({});

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
    setRows((data ?? []) as CompanyCredential[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!app) return;
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const { error: err } = await supabase.from("company_credentials").insert({
      title: String(form.get("title") || "").trim(),
      username: String(form.get("username") || "").trim() || null,
      secret: String(form.get("secret") || "").trim() || null,
      url: String(form.get("url") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null,
      created_by: app.userId,
    });
    if (err) {
      setError(err.message);
      return;
    }
    e.currentTarget.reset();
    await load();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("company_credentials").delete().eq("id", id);
    await load();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Company"
        title="Credentials"
        description="Store company-related logins and keys here so the team does not lose them. This is a shared internal record, not a bank-grade password manager — anyone signed in can see these entries."
      />
      <p className="mb-6 rounded-2xl border border-rule bg-cream px-4 py-3 text-sm text-ink-soft">
        Use this for portal logins, ads accounts, domain panels, and similar company access. Do not put personal banking
        passwords here.
      </p>
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        <form onSubmit={add} className="space-y-3 rounded-2xl border border-rule bg-cream p-5">
          <h2 className="text-lg font-semibold">Add a record</h2>
          <Field label="What is this">
            <Input name="title" required placeholder="Meta ads, Google Workspace…" />
          </Field>
          <Field label="Username / email">
            <Input name="username" />
          </Field>
          <Field label="Password or key">
            <Input name="secret" type="password" autoComplete="off" />
          </Field>
          <Field label="URL">
            <Input name="url" placeholder="https://" />
          </Field>
          <Field label="Notes">
            <Textarea name="notes" rows={3} />
          </Field>
          <Button type="submit">Save</Button>
        </form>
        <div className="space-y-3">
          {rows === null ? (
            <PageFallback />
          ) : rows.length === 0 ? (
            <p className="text-sm text-ink-soft">No credentials saved yet.</p>
          ) : (
            rows.map((row) => (
              <article key={row.id} className="rounded-2xl border border-rule bg-cream p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{row.title}</h3>
                    {row.username ? <p className="text-sm text-ink-soft">{row.username}</p> : null}
                    {row.url ? (
                      <a href={row.url} className="text-sm text-terracotta" target="_blank" rel="noreferrer">
                        {row.url}
                      </a>
                    ) : null}
                  </div>
                  <button className="text-xs text-terracotta" onClick={() => void remove(row.id)}>
                    Remove
                  </button>
                </div>
                {row.secret ? (
                  <p className="mt-2 font-mono text-sm">
                    {shown[row.id] ? row.secret : "••••••••"}{" "}
                    <button
                      type="button"
                      className="text-xs text-terracotta"
                      onClick={() => setShown((s) => ({ ...s, [row.id]: !s[row.id] }))}
                    >
                      {shown[row.id] ? "Hide" : "Show"}
                    </button>
                  </p>
                ) : null}
                {row.notes ? <p className="mt-2 text-sm text-ink-soft">{row.notes}</p> : null}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
