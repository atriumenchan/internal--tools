"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import type { NotificationItem } from "@/lib/types";

export default function NotificationsPage() {
  const [rows, setRows] = useState<NotificationItem[] | null>(null);

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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
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
  }

  if (!rows) return <PageFallback />;

  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Messages, task assignments, comments, @mentions, and company announcements."
        actions={
          <Button variant="secondary" onClick={() => void markAll()}>
            Mark all read
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState>Nothing yet</EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
          {rows.map((row) => (
            <li key={row.id} className={row.read_at ? "border-b border-border last:border-0" : "border-b border-border last:border-0 bg-teal-dim"}>
              <Link href={row.href || "/dashboard"} className="block px-4 py-3.5 transition duration-200 hover:bg-surface-2">
                <div className="flex items-start gap-3">
                  {!row.read_at ? <span className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-coral" /> : <span className="mt-1.5 h-[7px] w-[7px] shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className={row.read_at ? "font-medium text-muted" : "font-semibold text-ink"}>{row.title}</p>
                    {row.body ? <p className="mt-0.5 truncate text-sm text-muted">{row.body}</p> : null}
                    <p className="mt-1 font-mono text-[12px] text-faint">{new Date(row.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
