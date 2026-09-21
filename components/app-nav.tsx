"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Icon } from "@phosphor-icons/react";
import { Bell } from "@phosphor-icons/react/dist/ssr/Bell";
import { BookOpen } from "@phosphor-icons/react/dist/ssr/BookOpen";
import { ChatCircleDots } from "@phosphor-icons/react/dist/ssr/ChatCircleDots";
import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { GearSix } from "@phosphor-icons/react/dist/ssr/GearSix";
import { Kanban } from "@phosphor-icons/react/dist/ssr/Kanban";
import { Key } from "@phosphor-icons/react/dist/ssr/Key";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { SignOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import { SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { UploadSimple } from "@phosphor-icons/react/dist/ssr/UploadSimple";
import { UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { isAdminEmail } from "@/lib/admin";
import { WORKSPACE_ROLE_LABELS, workspaceRole } from "@/lib/roles";

type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  adminOnly?: boolean;
  operatorOnly?: boolean;
};

const GROUPS: { label: string; operatorOnly?: boolean; items: NavItem[] }[] = [
  {
    label: "Work",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: SquaresFour },
      { href: "/spaces", label: "Tasks", icon: ClipboardText },
      { href: "/chat", label: "Chat", icon: ChatCircleDots },
      { href: "/notifications", label: "Alerts", icon: Bell },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/vault", label: "Logins", icon: Key },
      { href: "/handbook", label: "Handbook", icon: BookOpen },
    ],
  },
  {
    label: "Office",
    operatorOnly: true,
    items: [
      { href: "/board", label: "Board", icon: Kanban, operatorOnly: true },
      { href: "/attendance", label: "Upload", icon: UploadSimple, operatorOnly: true },
      { href: "/offers", label: "Offers", icon: FileText, operatorOnly: true },
      { href: "/employees", label: "People", icon: UsersThree, operatorOnly: true },
      { href: "/team", label: "Staff", icon: ShieldCheck, adminOnly: true, operatorOnly: true },
      { href: "/settings", label: "Settings", icon: GearSix, operatorOnly: true },
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
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 shadow-card">
      <span className="flex items-center gap-2 text-[12px] text-muted">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-teal" aria-hidden />
        Noida · IST
      </span>
      <time className="font-mono text-[13px] font-medium text-ink tabular-nums" dateTime={time || undefined}>
        {time || "--:--"}
      </time>
    </div>
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
    <aside className="no-print flex flex-col border-b border-border bg-page text-ink lg:min-h-screen lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-4 py-6 lg:block">
        <div>
          <p className="font-display text-[20px] font-medium tracking-tight">{companyName || "ADMEXO"}</p>
          <p className="mt-1 text-[11px] font-medium text-faint">Workspace</p>
        </div>
        <button
          onClick={signOut}
          className="rounded-sm p-2 text-muted transition duration-150 hover:bg-surface-2 hover:text-ink lg:hidden"
          aria-label="Sign out"
        >
          <SignOut size={18} weight="light" />
        </button>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-6 lg:overflow-visible lg:px-3">
        {GROUPS.filter((group) => !group.operatorOnly || operator).map((group) => {
          const items = group.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="flex shrink-0 items-center gap-1 lg:block">
              <p className="hidden px-3 pb-2 text-[11px] font-medium tracking-[0.07em] text-faint uppercase lg:block">
                {group.label}
              </p>
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                const count = item.href === "/chat" ? chatUnread : item.href === "/notifications" ? notifUnread : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={cn(
                      "relative flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-[13px] font-medium whitespace-nowrap",
                      "transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none",
                      "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--amber-dim)]",
                      active ? "bg-amber-dim text-amber" : "text-muted hover:bg-surface-2 hover:text-ink"
                    )}
                  >
                    <Icon size={18} weight={active ? "regular" : "light"} className="text-current" />
                    {item.label}
                    {count > 0 ? (
                      <span className="ml-auto flex items-center gap-1.5" title={`${count} unread`}>
                        <span className="h-[7px] w-[7px] rounded-full bg-coral" aria-hidden />
                        <span className="font-mono text-[11px] text-muted tabular-nums">{count > 99 ? "99+" : count}</span>
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="mt-auto hidden space-y-4 border-t border-border px-4 py-5 lg:block">
        <NoidaClock />
        <div>
          <p className="truncate text-[13px] font-medium text-ink">{profile.full_name || profile.email}</p>
          <p className="mt-0.5 text-[12px] text-muted">{roleLabel}</p>
          <button
            onClick={signOut}
            className="mt-3 flex items-center gap-2 text-[12px] text-muted transition duration-150 hover:text-ink"
          >
            <SignOut size={18} weight="light" /> Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

export function SidebarFallback() {
  return (
    <aside className="no-print min-h-[4.5rem] border-b border-border bg-page lg:min-h-screen lg:border-b-0 lg:border-r" />
  );
}

export function PageFallback() {
  return (
    <div className="animate-pulse space-y-4 motion-reduce:animate-none">
      <div className="h-8 w-64 rounded-sm bg-surface-2" />
      <div className="h-4 w-full max-w-xl rounded-sm bg-surface-2" />
      <div className="mt-8 h-48 rounded-md bg-surface shadow-card" />
    </div>
  );
}
