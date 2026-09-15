"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, PageHeader } from "@/components/ui";
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
        <p className="text-sm text-ink-soft">Nothing yet. When someone messages you or assigns a task, it lands here.</p>
      ) : (
        <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-cream">
          {rows.map((row) => (
            <li key={row.id} className={row.read_at ? "opacity-60" : ""}>
              <Link href={row.href || "/dashboard"} className="block px-4 py-3 hover:bg-white/5">
                <p className="font-medium">{row.title}</p>
                {row.body ? <p className="mt-0.5 truncate text-sm text-ink-soft">{row.body}</p> : null}
                <p className="mt-1 text-[11px] text-ink-soft">{new Date(row.created_at).toLocaleString()}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
