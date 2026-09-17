"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  ClipboardList,
  FileSignature,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
  SquareKanban,
  Timer,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { isAdminEmail } from "@/lib/admin";
import { WORKSPACE_ROLE_LABELS, workspaceRole } from "@/lib/roles";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  operatorOnly?: boolean;
};

const GROUPS: { label: string; operatorOnly?: boolean; items: NavItem[] }[] = [
  {
    label: "Work",
    items: [
      { href: "/dashboard", label: "Home", icon: LayoutDashboard },
      { href: "/spaces", label: "Tasks", icon: SquareKanban },
      { href: "/chat", label: "Chat", icon: MessageSquare },
      { href: "/notifications", label: "Alerts", icon: Bell },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/vault", label: "Logins", icon: KeyRound },
      { href: "/handbook", label: "Handbook", icon: BookOpen },
    ],
  },
  {
    label: "Office",
    operatorOnly: true,
    items: [
      { href: "/board", label: "Board", icon: ClipboardList, operatorOnly: true },
      { href: "/attendance", label: "Upload", icon: Timer, operatorOnly: true },
      { href: "/offers", label: "Offers", icon: FileSignature, operatorOnly: true },
      { href: "/employees", label: "People", icon: Users, operatorOnly: true },
      { href: "/team", label: "Staff", icon: Shield, adminOnly: true, operatorOnly: true },
      { href: "/settings", label: "Settings", icon: Settings, operatorOnly: true },
    ],
  },
];

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
    router.push("/login");
    router.refresh();
  }

  function visible(item: NavItem) {
    if (item.adminOnly && !(profile.role === "admin" || isAdminEmail(profile.email))) return false;
    if (item.operatorOnly && !operator) return false;
    return true;
  }

  return (
    <aside className="no-print flex flex-col border-b border-rule bg-sidebar text-ink lg:min-h-screen lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-5 py-6 lg:block">
        <div>
          <p className="text-lg font-semibold tracking-tight">{companyName || "ADMEXO"}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Workspace</p>
        </div>
        <button
          onClick={signOut}
          className="rounded-[10px] p-2 text-muted transition duration-200 hover:bg-white/5 hover:text-ink lg:hidden"
          aria-label="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-5 lg:overflow-visible lg:px-3">
        {GROUPS.filter((group) => !group.operatorOnly || operator).map((group) => {
          const items = group.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="flex shrink-0 items-center gap-1 lg:block">
              <p className="hidden px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted lg:block">
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
                      "relative flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm whitespace-nowrap transition duration-200",
                      active
                        ? "bg-terracotta/12 font-medium text-ink"
                        : "text-muted hover:bg-white/[0.04] hover:text-ink"
                    )}
                  >
                    {active ? <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-terracotta" /> : null}
                    <Icon size={16} strokeWidth={1.75} className={active ? "text-terracotta" : "text-current"} />
                    {item.label}
                    {count > 0 ? (
                      <span
                        className={cn(
                          "ml-auto rounded-md px-1.5 text-[10px] font-semibold",
                          active ? "bg-terracotta/20 text-terracotta" : "bg-blue/15 text-blue-soft"
                        )}
                      >
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
      <div className="mt-auto hidden border-t border-rule px-5 py-5 lg:block">
        <p className="truncate text-sm font-medium">{profile.full_name || profile.email}</p>
        <p className="text-xs text-muted">{roleLabel}</p>
        <button
          onClick={signOut}
          className="mt-3 flex items-center gap-2 text-xs text-muted transition duration-200 hover:text-ink"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}

export function SidebarFallback() {
  return (
    <aside className="no-print min-h-[4.5rem] border-b border-rule bg-sidebar lg:min-h-screen lg:border-b-0 lg:border-r" />
  );
}

export function PageFallback() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-3 w-24 rounded bg-rule" />
      <div className="h-8 w-64 rounded bg-rule" />
      <div className="h-4 w-full max-w-xl rounded bg-rule/80" />
      <div className="mt-8 h-48 rounded-xl border border-rule bg-cream shadow-card" />
    </div>
  );
}
