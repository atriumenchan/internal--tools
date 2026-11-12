"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { avatarSrc } from "@/lib/avatar";
import { JoinMeetButton } from "@/components/join-meet";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { isAdminEmail } from "@/lib/admin";
import { displayName } from "@/lib/spaces";
import { WORKSPACE_ROLE_LABELS, workspaceRole } from "@/lib/roles";

type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  operatorOnly?: boolean;
};

const GROUPS: { label: string; operatorOnly?: boolean; items: NavItem[] }[] = [
  {
    label: "Work",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/tasks", label: "Tasks" },
      { href: "/spaces", label: "Spaces" },
      { href: "/reports", label: "Reports" },
      { href: "/chat", label: "Chat" },
      { href: "/notifications", label: "Alerts" },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/my-attendance", label: "My attendance" },
      { href: "/wfh", label: "WFH" },
      { href: "/metrics", label: "Metrics" },
      { href: "/notes", label: "Daily notes" },
      { href: "/vault", label: "Logins" },
      { href: "/profile", label: "Profile" },
      { href: "/handbook", label: "Handbook" },
    ],
  },
  {
    label: "Office",
    operatorOnly: true,
    items: [
      { href: "/board", label: "Board", operatorOnly: true },
      { href: "/attendance", label: "Upload", operatorOnly: true },
      { href: "/offers", label: "Offers", operatorOnly: true },
      { href: "/employees", label: "People", operatorOnly: true },
      { href: "/team", label: "Staff", adminOnly: true, operatorOnly: true },
      { href: "/settings", label: "Settings", operatorOnly: true },
    ],
  },
];

function NoidaClock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => {
      setTime(
        new Date().toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <p className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
      <span className="inline-flex items-center gap-2 text-[13px] text-muted">
        <span className="inline-block h-1.5 w-1.5 bg-amber" aria-hidden />
        Noida
      </span>
      <time className="tabular text-[13px] text-ink" dateTime={time || undefined}>
        {time || "--:--"}
      </time>
    </p>
  );
}

export function AppNav({
  profile,
  companyName,
  operator,
  chatUnread = 0,
  notifUnread = 0,
}: {
  profile: Profile;
  companyName: string;
  operator: boolean;
  chatUnread?: number;
  notifUnread?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const roleLabel = WORKSPACE_ROLE_LABELS[workspaceRole(profile)];

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    sessionStorage.removeItem("it-shell-v1");
    sessionStorage.removeItem("it-shell-v2");
    sessionStorage.removeItem("it-shell-v3");
    sessionStorage.removeItem("it-shell-v4");
    sessionStorage.removeItem("it-shell-v5");
    sessionStorage.removeItem("it-workspace-v1");
    router.push("/login");
    router.refresh();
  }

  function visible(item: NavItem) {
    if (item.adminOnly && !(profile.role === "admin" || isAdminEmail(profile.email))) return false;
    if (item.operatorOnly && !operator) return false;
    return true;
  }

  return (
    <aside className="no-print flex flex-col border-b border-ink bg-canvas text-ink lg:min-h-screen lg:border-b-0 lg:border-r">
      <div className="flex items-end justify-between px-5 pt-6 pb-5 lg:block">
        <div>
          <p className="font-display text-[22px] font-medium leading-none tracking-[-0.02em]">
            {companyName || "ADMEXO"}
          </p>
          <p className="mt-1 font-display text-[15px] italic leading-none text-amber">Workspace</p>
        </div>
        <button
          onClick={signOut}
          className="text-[13px] text-muted underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-ink lg:hidden"
        >
          Sign out
        </button>
      </div>
      <div className="px-5 pb-3 lg:hidden">
        <JoinMeetButton className="w-full" />
      </div>
      <nav className="flex gap-4 overflow-x-auto px-3 pb-3 lg:block lg:space-y-6 lg:overflow-visible lg:px-3">
        {GROUPS.filter((group) => !group.operatorOnly || operator).map((group) => {
          const items = group.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="flex shrink-0 items-center gap-1 lg:block">
              <p className="hidden px-2.5 pb-1 font-display text-[15px] italic text-amber lg:block">{group.label}</p>
              {items.map((item) => {
                const active =
                  item.href === "/tasks"
                    ? pathname === "/tasks" || pathname.includes("/tasks/")
                    : item.href === "/spaces"
                      ? pathname === "/spaces" || (pathname.startsWith("/spaces/") && !pathname.includes("/tasks/"))
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const count = item.href === "/chat" ? chatUnread : item.href === "/notifications" ? notifUnread : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={cn(
                      "relative flex h-8 items-center gap-3 border-b-2 border-transparent px-2.5 text-[14.5px] whitespace-nowrap lg:border-b-0 lg:border-l-2",
                      "transition-colors duration-150 motion-reduce:transition-none",
                      active ? "border-amber text-ink" : "text-muted hover:text-ink"
                    )}
                  >
                    {item.href === "/my-attendance" && operator ? "Reports" : item.label}
                    {count > 0 ? (
                      <span className="tabular ml-auto text-[12px] text-amber" title={`${count} unread`}>
                        {count > 99 ? "99+" : count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="mt-auto hidden space-y-4 px-5 py-5 lg:block">
        <JoinMeetButton className="w-full" />
        <NoidaClock />
        <div className="border-t border-border pt-3">
          <Link href="/profile" className="flex items-center gap-2.5">
            <Avatar name={displayName(profile)} src={avatarSrc(profile)} />
            <span className="min-w-0">
              <span className="block truncate text-[14px] text-ink">{displayName(profile)}</span>
              <span className="mt-0.5 block text-[12px] text-muted">{roleLabel}</span>
            </span>
          </Link>
          <button
            onClick={signOut}
            className="mt-3 text-[13px] text-muted underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

export function SidebarFallback() {
  return (
    <aside className="no-print min-h-[4.5rem] border-b border-ink bg-canvas lg:min-h-screen lg:border-b-0 lg:border-r" />
  );
}

export function PageFallback() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 bg-surface-2" />
      <div className="h-4 w-full max-w-xl bg-surface-2" />
      <div className="mt-8 h-48 border border-border bg-surface" />
    </div>
  );
}
