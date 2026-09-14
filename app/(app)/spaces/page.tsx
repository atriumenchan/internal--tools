"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, PageHeader } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { canCreateSpace, missingSpacesSchema, SPACE_COLORS } from "@/lib/spaces";
import type { Space } from "@/lib/types";

export default function SpacesPage() {
  const app = useAppState();
  const router = useRouter();
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SPACE_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const allowCreate = canCreateSpace(app?.profile, app?.anyoneCanCreateSpaces ?? true);

  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("spaces")
      .select("id, name, color, created_by, created_at")
      .order("name")
      .then(({ data, error: err }) => {
        if (err) {
          setError(
            missingSpacesSchema(err.message)
              ? "Spaces are not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor, then refresh."
              : err.message
          );
          setSpaces([]);
          return;
        }
        setSpaces((data ?? []) as Space[]);
      });
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!allowCreate) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("create_space", { p_name: name, p_color: color });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (typeof data === "string") router.push(`/spaces/${data}`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Work"
        title="Spaces"
        description="A Space is a work area: members, tasks, and a chat channel. Everyone starts in ADMEXO."
      />
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {allowCreate ? (
        <form onSubmit={create} className="mb-8 flex flex-wrap items-end gap-3 rounded-2xl border border-rule bg-cream p-4">
          <Field label="New Space" className="min-w-[16rem] flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">Color</p>
            <div className="flex gap-2">
              {SPACE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-8 w-8 rounded-full border-2"
                  style={{ background: c, borderColor: color === c ? "#fff" : "transparent" }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </form>
      ) : null}
      {spaces === null ? (
        <PageFallback />
      ) : spaces.length === 0 ? (
        <p className="text-sm text-ink-soft">No Spaces yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {spaces.map((space) => (
            <li key={space.id}>
              <button
                type="button"
                onClick={() => router.push(`/spaces/${space.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-rule bg-cream p-4 text-left hover:border-terracotta"
              >
                <span
                  className="h-10 w-10 shrink-0 rounded-xl"
                  style={{ background: space.color || "#FF5A1F" }}
                />
                <span>
                  <span className="block font-medium">{space.name}</span>
                  <span className="text-xs text-ink-soft">Open tasks</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
