"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Hit = { href: string; label: string; kind: string };

const PAGES: Hit[] = [
  { href: "/dashboard", label: "Dashboard", kind: "Page" },
  { href: "/tasks", label: "Tasks", kind: "Page" },
  { href: "/spaces", label: "Spaces", kind: "Page" },
  { href: "/reports", label: "Reports", kind: "Page" },
  { href: "/chat", label: "Chat", kind: "Page" },
  { href: "/notifications", label: "Alerts", kind: "Page" },
  { href: "/my-attendance", label: "My attendance", kind: "Page" },
  { href: "/wfh", label: "WFH", kind: "Page" },
  { href: "/metrics", label: "Metrics", kind: "Page" },
  { href: "/notes", label: "Daily notes", kind: "Page" },
  { href: "/vault", label: "Logins", kind: "Page" },
  { href: "/profile", label: "Profile", kind: "Page" },
  { href: "/handbook", label: "Handbook", kind: "Page" },
  { href: "/board", label: "Attendance board", kind: "Page" },
  { href: "/attendance", label: "Upload attendance", kind: "Page" },
  { href: "/offers", label: "Offers", kind: "Page" },
  { href: "/employees", label: "People", kind: "Page" },
];

export function CommandSearch({
  open,
  onOpen,
  onClose,
  buttonClassName,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  buttonClassName?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>(PAGES.slice(0, 8));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) onClose();
        else onOpen();
      }
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpen, onClose]);

  useEffect(() => {
    if (!open) return;
    const text = query.trim();
    const pages = PAGES.filter((page) => page.label.toLowerCase().includes(text.toLowerCase()));
    if (!text) {
      setHits(pages.slice(0, 8));
      return;
    }
    const handle = window.setTimeout(async () => {
      const supabase = createClient();
      const like = `%${text}%`;
      const [tasks, spaces] = await Promise.all([
        supabase.from("tasks").select("id, title, space_id").ilike("title", like).limit(6),
        supabase.from("spaces").select("id, name").ilike("name", like).limit(4),
      ]);
      const found: Hit[] = [...pages.slice(0, 4)];
      for (const space of spaces.data ?? []) {
        found.push({ href: `/spaces/${space.id}`, label: String(space.name), kind: "Space" });
      }
      for (const task of tasks.data ?? []) {
        found.push({
          href: `/spaces/${task.space_id}/tasks/${task.id}`,
          label: String(task.title),
          kind: "Task",
        });
      }
      setHits(found.slice(0, 10));
    }, 160);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  function go(href: string) {
    onClose();
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex h-10 w-full max-w-[460px] items-center gap-2 rounded-[8px] border border-border bg-surface px-3 text-left text-[13px] text-faint shadow-card transition duration-150 hover:border-border-strong",
          buttonClassName
        )}
      >
        <Search size={16} />
        <span className="min-w-0 flex-1 truncate">Search anything...</span>
        <kbd className="hidden rounded-[6px] border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] leading-4 font-semibold text-muted sm:inline">
          Ctrl K
        </kbd>
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-start bg-ink/30 px-4 pt-[12vh]" onMouseDown={onClose}>
          <div
            role="dialog"
            aria-label="Search"
            className="mx-auto w-full max-w-[520px] overflow-hidden rounded-[14px] border border-border bg-surface shadow-float"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search size={16} className="text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search anything..."
                className="h-12 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
              />
            </div>
            <ul className="max-h-[320px] overflow-auto p-1.5">
              {hits.length === 0 ? (
                <li className="px-3 py-6 text-center text-[13px] text-muted">Nothing matches that.</li>
              ) : (
                hits.map((hit) => (
                  <li key={`${hit.kind}-${hit.href}`}>
                    <button
                      type="button"
                      onClick={() => go(hit.href)}
                      className="flex w-full items-center justify-between gap-3 rounded-[8px] px-3 py-2.5 text-left hover:bg-surface-2"
                    >
                      <span className="truncate text-[13px] font-medium text-ink">{hit.label}</span>
                      <span className="shrink-0 text-[11px] font-semibold tracking-[0.04em] text-faint uppercase">{hit.kind}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
