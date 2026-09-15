"use client";

import { useEffect, useRef, useState } from "react";
import { Button, PageHeader, Textarea } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";

type Turn = { role: "user" | "assistant"; content: string };

export default function MindPage() {
  const app = useAppState();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/mind")
      .then((r) => r.json())
      .then((j) => setConfigured(Boolean(j.configured)))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, busy]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setQuestion("");
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    try {
      const res = await fetch("/api/mind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: turns.slice(-6) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Mind could not answer");
      setTurns((prev) => [...prev, { role: "assistant", content: String(json.answer) }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mind could not answer");
    } finally {
      setBusy(false);
    }
  }

  if (!app) return <PageFallback />;

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col">
      <PageHeader
        eyebrow="Data"
        title="Mind"
        description="Ask about attendance from the TeamOffice Excel uploads, people, tasks, Spaces, and announcements. DeepSeek answers from this workspace — it is not logged into TeamOffice."
      />
      {configured === false ? (
        <p className="mb-4 rounded-2xl border border-rule bg-cream px-4 py-3 text-sm text-ink-soft">
          Add <code className="text-terracotta">DEEPSEEK_API_KEY</code> in Vercel → Project → Settings → Environment
          Variables (Production), then redeploy. The key stays on the server.
        </p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-rule bg-cream p-4">
        {turns.length === 0 ? (
          <div className="text-sm text-ink-soft">
            <p>Try questions like:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Who was absent today?</li>
              <li>How many late days does Kartik have this month?</li>
              <li>Which tasks are overdue?</li>
            </ul>
          </div>
        ) : (
          turns.map((turn, i) => (
            <div key={i} className={turn.role === "user" ? "ml-8 text-right" : "mr-8"}>
              <p className="text-[11px] uppercase tracking-wide text-ink-soft">{turn.role === "user" ? "You" : "Mind"}</p>
              <p className="mt-1 inline-block whitespace-pre-wrap rounded-2xl bg-paper px-3 py-2 text-sm">{turn.content}</p>
            </div>
          ))
        )}
        {busy ? <p className="text-sm text-ink-soft">Reading the data…</p> : null}
        <div ref={bottom} />
      </div>
      <form onSubmit={ask} className="mt-3 space-y-2">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder="Ask about people, attendance, or work"
          required
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || configured === false}>
            {busy ? "Asking…" : "Ask"}
          </Button>
        </div>
      </form>
    </div>
  );
}
