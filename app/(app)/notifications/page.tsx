"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, ErrorText, PageHeader } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageFallback } from "@/components/app-nav";
import { useAppState, useWorkspaceCache } from "@/components/app-frame";
import type { NotificationItem } from "@/lib/types";

function deleteBlocked(message: string) {
  return message.includes("row-level security") || message.includes("policy")
    ? "Could not delete this alert. Paste supabase/notification-delete.sql in the Supabase SQL editor, then try again."
    : message;
}

export default function NotificationsPage() {
  const app = useAppState();
  const cache = useWorkspaceCache();
  const [rows, setRows] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(80);
    setRows((data ?? []) as NotificationItem[]);
  }

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

  async function markAll() {
    const supabase = createClient();
    await supabase.rpc("mark_notifications_read");
    await load();
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
    await cache?.refreshBadges();
  }

  async function openRow(row: NotificationItem) {
    if (!row.read_at) {
      const supabase = createClient();
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", row.id);
      setRows((prev) => (prev ?? []).map((item) => (item.id === row.id ? { ...item, read_at: new Date().toISOString() } : item)));
      await cache?.refreshBadges();
    }
  }

  if (!rows) return <PageFallback />;

  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Messages, task assignments, comments, @mentions, and company announcements."
        actions={
          rows.length > 0 ? (
            <ConfirmDelete
              label="Delete all"
              title="Delete all notifications?"
              description="They will be removed from your inbox. This cannot be undone."
              confirmLabel="Delete all"
              onConfirm={() => deleteAll()}
              extra={[
                {
                  label: "Mark all as read",
                  onSelect: () => void markAll(),
                },
              ]}
            />
          ) : null
        }
      />
      <ErrorText className="mb-4">{error}</ErrorText>
      {rows.length === 0 ? (
        <EmptyState>Nothing yet</EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
          {rows.map((row) => (
            <li
              key={row.id}
              className={
                row.read_at
                  ? "flex items-stretch border-b border-border last:border-0"
                  : "flex items-stretch border-b border-border last:border-0 bg-teal-dim"
              }
            >
              <Link
                href={row.href || "/dashboard"}
                onClick={() => void openRow(row)}
                className="min-w-0 flex-1 px-4 py-3.5 transition duration-200 hover:bg-surface-2"
              >
                <div className="flex items-start gap-3">
                  {!row.read_at ? <span className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-coral" /> : <span className="mt-1.5 h-[7px] w-[7px] shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className={row.read_at ? "font-medium text-muted" : "font-semibold text-ink"}>{row.title}</p>
                    {row.body ? <p className="mt-0.5 truncate text-sm text-muted">{row.body}</p> : null}
                    <p className="mt-1 font-mono text-[12px] text-faint">{new Date(row.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </Link>
              <div className="flex items-center pr-2">
                <ConfirmDelete
                  label="Delete notification"
                  title="Delete this notification?"
                  description="It will be removed from your inbox."
                  onConfirm={() => deleteRow(row.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
