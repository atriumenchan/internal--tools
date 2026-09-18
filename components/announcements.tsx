"use client";

import { useEffect, useState } from "react";
import { Pin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, Checkbox, ErrorText, Field, Input, Textarea } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { missingSpacesSchema } from "@/lib/spaces";
import { formatRelative } from "@/lib/datetime";
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
    const { error: err } = await supabase.from("announcements").delete().eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    await load();
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold tracking-tight">Announcements</h2>
        {operator ? (
          <Button type="button" size="sm" variant={compose ? "secondary" : "primary"} onClick={() => setCompose((v) => !v)}>
            {compose ? "Cancel" : "Post"}
          </Button>
        ) : null}
      </div>
      <ErrorText className="mt-2">{error}</ErrorText>
      {operator && compose ? (
        <form onSubmit={post} className="mt-4 space-y-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Office closed Friday…" />
          </Field>
          <Field label="Message">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} required />
          </Field>
          <Checkbox checked={pinned} onChange={setPinned}>
            Pin to the top
          </Checkbox>
          <Button type="submit" disabled={busy}>
            {busy ? "Posting…" : "Publish"}
          </Button>
        </form>
      ) : null}
      {!rows ? (
        <p className="mt-4 text-[13px] text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">No announcements yet.</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`rounded-[10px] bg-elevated px-5 py-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] ${
                row.pinned ? "border-l-[3px] border-l-terracotta pl-[17px]" : "border border-rule"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {row.pinned ? (
                    <Badge tone="accent">
                      <Pin size={11} />
                      Pinned
                    </Badge>
                  ) : null}
                  <p className={`text-[15px] font-semibold tracking-tight text-ink ${row.pinned ? "mt-2" : ""}`}>{row.title}</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">{row.body}</p>
                  <p className="mt-2 text-[12px] text-muted" title={new Date(row.created_at).toLocaleString()}>
                    {formatRelative(row.created_at)}
                  </p>
                </div>
                {operator ? (
                  <ConfirmDelete
                    label="Delete announcement"
                    title="Delete this announcement?"
                    onConfirm={() => remove(row.id)}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
