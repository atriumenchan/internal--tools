"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, ErrorText, Field, Input, Textarea } from "@/components/ui";
import { missingSpacesSchema } from "@/lib/spaces";
import type { Announcement } from "@/lib/types";

export function Announcements({ operator, userId }: { operator: boolean; userId: string }) {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("announcements")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8);
    if (err) {
      setError(
        missingSpacesSchema(err.message)
          ? "Announcements need a SQL patch. Paste supabase/announcements-mentions.sql in the Supabase SQL editor."
          : err.message
      );
      setRows([]);
      return;
    }
    setError(null);
    setRows((data ?? []) as Announcement[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.from("announcements").insert({
      title: title.trim(),
      body: body.trim(),
      pinned,
      created_by: userId,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setTitle("");
    setBody("");
    setCompose(false);
    await load();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("announcements").delete().eq("id", id);
    await load();
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Announcements</h2>
        {operator ? (
          <Button type="button" size="sm" variant={compose ? "secondary" : "primary"} onClick={() => setCompose((v) => !v)}>
            {compose ? "Cancel" : "Post"}
          </Button>
        ) : null}
      </div>
      <ErrorText className="mt-2">{error}</ErrorText>
      {operator && compose ? (
        <form onSubmit={post} className="mt-3 space-y-2">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Office closed Friday…" />
          </Field>
          <Field label="Message">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} required />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            Pin to the top
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Posting…" : "Publish"}
          </Button>
        </form>
      ) : null}
      {!rows ? (
        <p className="mt-3 text-sm text-ink-soft">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No announcements yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-[12px] border border-rule bg-surface px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {row.pinned ? <span className="mr-2 text-[10px] uppercase tracking-wide text-terracotta">Pinned</span> : null}
                    {row.title}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{row.body}</p>
                  <p className="mt-1 text-[11px] text-ink-soft">{new Date(row.created_at).toLocaleString()}</p>
                </div>
                {operator ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => void remove(row.id)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
