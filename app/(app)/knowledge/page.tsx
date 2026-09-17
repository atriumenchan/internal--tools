"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, ErrorText, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { displayName } from "@/lib/spaces";
import { canPublishKnowledge } from "@/lib/roles";
import type { Profile } from "@/lib/types";

const CATEGORIES = ["Policy", "SOP", "Guide", "Template", "Other"];

type Article = {
  id: string;
  title: string;
  category: string;
  body: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export default function KnowledgePage() {
  const app = useAppState();
  const canEdit = app ? canPublishKnowledge(app.profile) : false;
  const [rows, setRows] = useState<Article[] | null>(null);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Guide");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void Promise.all([
      supabase.from("knowledge_articles").select("*").order("updated_at", { ascending: false }),
      supabase.from("profiles").select("id, email, full_name, role"),
    ]).then(([docs, peopleRes]) => {
      if (docs.error) {
        setError("Docs are not set up yet. Paste supabase/workspace-lite.sql in the Supabase SQL editor, then refresh.");
        setRows([]);
        return;
      }
      setRows((docs.data ?? []) as Article[]);
      setPeople(Object.fromEntries(((peopleRes.data ?? []) as Profile[]).map((p) => [p.id, p])));
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!app || !title.trim()) return;
    const supabase = createClient();
    if (editing) {
      const { data, error: err } = await supabase
        .from("knowledge_articles")
        .update({ title: title.trim(), category, body, updated_by: app.userId })
        .eq("id", editing)
        .select("*")
        .single();
      if (err || !data) {
        setError(err?.message || "Could not save.");
        return;
      }
      setRows((prev) => (prev ?? []).map((row) => (row.id === editing ? (data as Article) : row)));
    } else {
      const { data, error: err } = await supabase
        .from("knowledge_articles")
        .insert({
          title: title.trim(),
          category,
          body,
          created_by: app.userId,
          updated_by: app.userId,
        })
        .select("*")
        .single();
      if (err || !data) {
        setError(err?.message || "Could not save.");
        return;
      }
      setRows((prev) => [data as Article, ...(prev ?? [])]);
    }
    setTitle("");
    setBody("");
    setEditing(null);
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error: err } = await supabase.from("knowledge_articles").delete().eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    setRows((prev) => (prev ?? []).filter((row) => row.id !== id));
    if (editing === id) {
      setEditing(null);
      setTitle("");
      setBody("");
    }
  }

  if (!app || rows === null) return <PageFallback />;

  return (
    <div>
      <PageHeader
        title="Knowledge"
        description="Short company docs. Handbook PDF stays under Handbook."
      />
      <ErrorText className="mb-4">{error}</ErrorText>

      {canEdit ? (
        <form onSubmit={save} className="mb-8 space-y-3 rounded-xl border border-rule bg-cream p-5 shadow-card">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Body">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit">{editing ? "Save" : "Add doc"}</Button>
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setTitle("");
                  setBody("");
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rule bg-surface px-4 py-12 text-center text-sm text-ink-soft">
          No docs yet.{canEdit ? " Add the first one above." : " Ask a manager to add one."}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{row.category}</p>
                    <h2 className="mt-1 text-lg font-semibold">{row.title}</h2>
                  </div>
                  {canEdit ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditing(row.id);
                          setTitle(row.title);
                          setCategory(row.category);
                          setBody(row.body);
                        }}
                      >
                        Edit
                      </Button>
                      <ConfirmDelete label="Delete doc" title="Delete this doc?" onConfirm={() => remove(row.id)} />
                    </div>
                  ) : null}
                </div>
                {row.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{row.body}</p> : null}
                <p className="mt-3 text-[12px] text-muted">
                  Last edited by {displayName(people[row.updated_by || ""] || people[row.created_by || ""])} ·{" "}
                  {new Date(row.updated_at || row.created_at).toLocaleString()}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
