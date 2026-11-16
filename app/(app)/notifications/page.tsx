"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AtSign, Bell, CalendarClock, CheckCheck, Megaphone, MessageCircle, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, EmptyState, ErrorText, PageHeader } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageFallback } from "@/components/app-nav";
import { Pager } from "@/components/pager";
import { useAppState, useWorkspaceCache } from "@/components/app-frame";
import { formatStamp } from "@/lib/datetime";
import { paginate } from "@/lib/task-overview";
import { cn } from "@/lib/utils";
import { seesApiBalances } from "@/lib/api-balances";
import type { NotificationItem } from "@/lib/types";

type View = "all" | "unread" | "mention" | "task" | "message" | "announcement";

const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mention", label: "Mentions" },
  { id: "task", label: "Tasks" },
  { id: "message", label: "Messages" },
  { id: "announcement", label: "Announcements" },
];

function deleteBlocked(message: string) {
  return message.includes("row-level security") || message.includes("policy")
    ? "Could not delete this alert. Paste supabase/notification-delete.sql in the Supabase SQL editor, then try again."
    : message;
}

function noticeFace(type: string) {
  if (type === "mention" || type.includes("mention")) {
    return { label: "Mention", wash: "bg-[var(--mention-soft)] text-[var(--mention-ink)]", Icon: AtSign };
  }
  if (type === "task_assigned") {
    return { label: "Assignment", wash: "bg-[var(--info-soft)] text-[var(--info-ink)]", Icon: UserRound };
  }
  if (type === "api_balance") {
    return { label: "Balance", wash: "bg-coral-dim text-coral", Icon: CalendarClock };
  }
  if (type === "task_overdue") {
    return { label: "Deadline", wash: "bg-[var(--warning-soft)] text-[var(--prio-medium-fg)]", Icon: CalendarClock };
  }
  if (type === "announcement") {
    return { label: "Announcement", wash: "bg-surface-2 text-ink", Icon: Megaphone };
  }
  if (type === "message") {
    return { label: "Message", wash: "bg-teal-dim text-teal", Icon: MessageCircle };
  }
  if (type.includes("task")) {
    return { label: "Task", wash: "bg-[var(--info-soft)] text-[var(--info-ink)]", Icon: Bell };
  }
  return { label: "Update", wash: "bg-surface-2 text-muted", Icon: Bell };
}

function matches(row: NotificationItem, view: View) {
  if (view === "all") return true;
  if (view === "unread") return !row.read_at;
  if (view === "mention") return row.type === "mention" || row.type.includes("mention");
  if (view === "announcement") return row.type === "announcement";
  if (view === "message") return row.type === "message";
  return row.type.includes("task");
}

function NotificationsPageInner() {
  const app = useAppState();
  const cache = useWorkspaceCache();
  const router = useRouter();
  const search = useSearchParams();
  const pageParam = Math.max(1, Number(search.get("page") || 1) || 1);
  const view = (VIEWS.some((item) => item.id === search.get("view")) ? search.get("view") : "all") as View;
  const [rows, setRows] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openBody, setOpenBody] = useState<string | null>(null);
  const visible = useMemo(() => (rows ?? []).filter((row) => matches(row, view)), [rows, view]);
  const paged = useMemo(() => paginate(visible, pageParam), [visible, pageParam]);
  const unread = (rows ?? []).filter((row) => !row.read_at).length;

  async function load() {
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("user_id", app?.userId ?? "").eq("type", "whatsapp_delivery");
    if (app && !seesApiBalances(app.profile)) {
      await supabase.from("notifications").delete().eq("user_id", app.userId).eq("type", "api_balance");
    }
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false });
    const mine = seesApiBalances(app?.profile);
    setRows(
      ((data ?? []) as NotificationItem[]).filter(
        (row) => row.type !== "whatsapp_delivery" && (mine || row.type !== "api_balance")
      )
    );
  }

  useEffect(() => {
    if (!rows) return;
    if (pageParam > paged.pages) setPage(paged.pages, view);
    // setPage is stable enough for a clamp; view is included so a filter change doesn't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, pageParam, paged.pages, view]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  function setPage(next: number, nextView = view) {
    const params = new URLSearchParams();
    if (nextView !== "all") params.set("view", nextView);
    if (next > 1) params.set("page", String(next));
    const query = params.toString();
    router.replace(query ? `/notifications?${query}` : "/notifications");
  }

  async function markAll() {
    const supabase = createClient();
    await supabase.rpc("mark_notifications_read");
    await load();
    await cache?.refreshBadges();
  }

  async function markOne(row: NotificationItem) {
    if (row.read_at) return;
    const supabase = createClient();
    const stamp = new Date().toISOString();
    await supabase.from("notifications").update({ read_at: stamp }).eq("id", row.id);
    setRows((prev) => (prev ?? []).map((item) => (item.id === row.id ? { ...item, read_at: stamp } : item)));
    await cache?.refreshBadges();
  }

  async function deleteRow(id: string) {
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("notifications").delete().eq("id", id);
    if (err) {
      setError(deleteBlocked(err.message));
      return;
    }
    setRows((prev) => (prev ?? []).filter((row) => row.id !== id));
    await cache?.refreshBadges();
  }

  async function deleteAll() {
    if (!app) return;
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("notifications").delete().eq("user_id", app.userId);
    if (err) {
      setError(deleteBlocked(err.message));
      return;
    }
    setRows([]);
    setPage(1);
    await cache?.refreshBadges();
  }

  if (!rows) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading alerts">
        <div className="h-9 w-56 rounded-[8px] bg-surface-2" />
        <div className="h-4 w-80 rounded-[8px] bg-surface-2" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[88px] rounded-[12px] border border-border bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Alerts"
        description="Mentions, assignments, messages, and announcements, newest first."
        actions={
          <div className="flex items-center gap-2">
            {unread > 0 ? (
              <Button type="button" variant="secondary" onClick={() => void markAll()}>
                <CheckCheck size={16} />
                Mark all as read
              </Button>
            ) : null}
            {rows.length > 0 ? (
              <ConfirmDelete
                label="Delete all"
                title="Delete all notifications?"
                description="They will be removed from your inbox. This cannot be undone."
                confirmLabel="Delete all"
                onConfirm={() => deleteAll()}
              />
            ) : null}
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {VIEWS.map((item) => {
          const count = item.id === "unread" ? unread : null;
          const on = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => setPage(1, item.id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors duration-150",
                on ? "bg-[var(--graphite)] text-[var(--text-inverse)]" : "bg-surface text-muted hover:bg-surface-2 hover:text-ink"
              )}
            >
              {item.label}
              {count ? <span className="tabular text-[12px]">{count}</span> : null}
            </button>
          );
        })}
      </div>
      <ErrorText className="mb-4">{error}</ErrorText>
      {visible.length === 0 ? (
        <EmptyState>{view === "all" ? "Nothing yet." : "Nothing in this view."}</EmptyState>
      ) : (
        <section>
          <ul className="space-y-2">
            {paged.rows.map((row) => {
              const face = noticeFace(row.type);
              const Icon = face.Icon;
              const unreadRow = !row.read_at;
              const long = (row.body ?? "").length > 140;
              const expanded = openBody === row.id;
              return (
                <li
                  key={row.id}
                  className={cn(
                    "group flex items-stretch rounded-[12px] border border-border bg-surface shadow-card transition duration-150 hover:-translate-y-px hover:border-border-strong hover:bg-surface-2 hover:shadow-elevated motion-reduce:hover:translate-y-0",
                    unreadRow && "bg-[var(--brand-soft)]/40"
                  )}
                >
                  <Link
                    href={row.href || "/dashboard"}
                    onClick={() => void markOne(row)}
                    className="flex min-w-0 flex-1 gap-3 px-4 py-3.5"
                  >
                    <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[8px]", face.wash)}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        {unreadRow ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber" aria-label="Unread" /> : null}
                        <span className={cn("text-[14px] leading-5 text-ink", unreadRow ? "font-bold" : "font-semibold")}>{row.title}</span>
                      </span>
                      {row.body ? (
                        <span className={cn("mt-1 block text-[13px] leading-5 text-muted", expanded ? "" : "line-clamp-2")}>{row.body}</span>
                      ) : null}
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-4 text-muted">
                        <span className="font-semibold">{face.label}</span>
                        <span aria-hidden>·</span>
                        <span className="tabular">{formatStamp(row.created_at)}</span>
                        <span aria-hidden>·</span>
                        <span>{unreadRow ? "Unread" : "Read"}</span>
                      </span>
                    </span>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end justify-center gap-1 pr-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                    {long ? (
                      <button
                        type="button"
                        className="rounded-[6px] px-2 py-1 text-[12px] font-semibold text-amber hover:bg-surface"
                        onClick={() => setOpenBody((current) => (current === row.id ? null : row.id))}
                      >
                        {expanded ? "Shorter" : "Full message"}
                      </button>
                    ) : null}
                    {unreadRow ? (
                      <button
                        type="button"
                        className="rounded-[6px] px-2 py-1 text-[12px] font-semibold text-ink hover:bg-surface"
                        onClick={() => void markOne(row)}
                      >
                        Mark as read
                      </button>
                    ) : null}
                    <ConfirmDelete
                      label="Delete notification"
                      title="Delete this notification?"
                      description="It will be removed from your inbox."
                      onConfirm={() => deleteRow(row.id)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <Pager
            page={paged.page}
            pages={paged.pages}
            start={paged.start}
            end={paged.end}
            total={visible.length}
            onChange={(next) => setPage(next)}
          />
        </section>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <NotificationsPageInner />
    </Suspense>
  );
}
