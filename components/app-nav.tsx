"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  House,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  MessageCircle,
  NotebookPen,
  PanelLeft,
  Settings,
  Shield,
  SquareKanban,
  Upload,
  UserRound,
  Users,
  FileText,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { avatarSrc } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { isAdminEmail } from "@/lib/admin";
import { displayName } from "@/lib/spaces";
import { WORKSPACE_ROLE_LABELS, workspaceRole } from "@/lib/roles";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  operatorOnly?: boolean;
};

const GROUPS: { label: string; operatorOnly?: boolean; items: NavItem[] }[] = [
  {
    label: "Work",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/tasks", label: "Tasks", icon: ListTodo },
      { href: "/spaces", label: "Spaces", icon: SquareKanban },
      { href: "/reports", label: "Reports", icon: Megaphone },
      { href: "/chat", label: "Chat", icon: MessageCircle },
      { href: "/notifications", label: "Alerts", icon: Bell },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/my-attendance", label: "My attendance", icon: CalendarDays },
      { href: "/wfh", label: "WFH", icon: House },
      { href: "/metrics", label: "Metrics", icon: ChartNoAxesCombined },
      { href: "/notes", label: "Daily notes", icon: NotebookPen },
      { href: "/vault", label: "Logins", icon: KeyRound },
      { href: "/profile", label: "Profile", icon: UserRound },
      { href: "/handbook", label: "Handbook", icon: BookOpen },
    ],
  },
  {
    label: "Office",
    operatorOnly: true,
    items: [
      { href: "/board", label: "Board", icon: SquareKanban, operatorOnly: true },
      { href: "/attendance", label: "Upload", icon: Upload, operatorOnly: true },
      { href: "/offers", label: "Offers", icon: FileText, operatorOnly: true },
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
  collapsed = false,
  mobileOpen = false,
  onToggle,
  onCloseMobile,
}: {
  profile: Profile;
  companyName: string;
  operator: boolean;
  chatUnread?: number;
  notifUnread?: number;
  collapsed?: boolean;
  mobileOpen?: boolean;
  onToggle?: () => void;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const roleLabel = WORKSPACE_ROLE_LABELS[workspaceRole(profile)];
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    onCloseMobile?.();
    // Close the drawer after a navigation, not on every callback identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function visible(item: NavItem) {
    if (item.adminOnly && !(profile.role === "admin" || isAdminEmail(profile.email))) return false;
    if (item.operatorOnly && !operator) return false;
    return true;
  }

  return (
    <>
      {mobileOpen ? <button type="button" aria-label="Close navigation" className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={onCloseMobile} /> : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[238px] flex-col bg-[var(--sidebar-background)] text-[var(--sidebar-text)] transition-transform duration-200 lg:translate-x-0",
          collapsed && "lg:w-[72px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-[76px] items-center gap-2.5 border-b border-[var(--sidebar-border)] px-4">
          <img src="/icons/icon-192.png" alt="" className="h-8 w-8 shrink-0 rounded-[8px]" />
          <div className={cn("min-w-0", collapsed && "lg:hidden")}>
            <p className="truncate text-[14px] leading-5 font-bold tracking-[-0.02em] text-white">{companyName || "ADMEXO"}</p>
            <p className="text-[10px] leading-4 font-semibold tracking-[1.2px] text-[var(--sidebar-text-muted)] uppercase">Workspace</p>
          </div>
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggle}
            className="ml-auto hidden h-8 w-8 place-items-center rounded-[8px] text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white lg:grid"
          >
            <PanelLeft size={18} />
          </button>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
          {GROUPS.filter((group) => !group.operatorOnly || operator).map((group) => {
            const items = group.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={group.label}>
                <p className={cn("px-2.5 pb-2 text-[10px] leading-4 font-semibold tracking-[1.2px] text-[var(--sidebar-text-muted)] uppercase", collapsed && "lg:sr-only")}>
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active =
                      item.href === "/tasks"
                        ? pathname === "/tasks" || pathname.includes("/tasks/")
                        : item.href === "/spaces"
                          ? pathname === "/spaces" || (pathname.startsWith("/spaces/") && !pathname.includes("/tasks/"))
                          : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    const count = item.href === "/chat" ? chatUnread : item.href === "/notifications" ? notifUnread : 0;
                    const label = item.href === "/my-attendance" && operator ? "Reports" : item.label;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch
                        title={label}
                        className={cn(
                          "relative flex h-10 items-center gap-2 rounded-[8px] px-2.5 text-[14px] leading-5 font-semibold text-white transition-colors duration-150",
                          active
                            ? "bg-[var(--sidebar-active)]"
                            : "hover:bg-[var(--sidebar-hover)]"
                        )}
                      >
                        {active ? <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-amber" aria-hidden /> : null}
                        <Icon size={18} className={cn("shrink-0", active ? "text-amber" : "text-white")} />
                        <span className={cn("truncate", collapsed && "lg:hidden")}>{label}</span>
                        {count > 0 ? (
                          <span className={cn("tabular ml-auto text-[12px] text-amber", collapsed && "lg:hidden")}>{count > 99 ? "99+" : count}</span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-[var(--sidebar-border)] p-3">
          <p className={cn("px-1 pb-3 text-[11px] leading-4 text-[var(--sidebar-text-muted)]", collapsed && "lg:hidden")}>
            The internal workspace for the ADMEXO team.
          </p>
          <button
            type="button"
            onClick={() => setAccountOpen((v) => !v)}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left hover:bg-[var(--sidebar-hover)]"
          >
            <Avatar name={displayName(profile)} src={avatarSrc(profile)} size="sm" />
            <span className={cn("min-w-0", collapsed && "lg:hidden")}>
              <span className="block truncate text-[13px] font-semibold text-white">{displayName(profile)}</span>
              <span className="block truncate text-[12px] text-[var(--sidebar-text-muted)]">{roleLabel}</span>
            </span>
          </button>
          {accountOpen ? (
            <div className="mt-1 rounded-[10px] bg-[var(--sidebar-surface)] p-1">
              <Link href="/profile" className="block rounded-[8px] px-2.5 py-2 text-[13px] text-white hover:bg-[var(--sidebar-hover)]">
                Profile
              </Link>
              <button type="button" onClick={() => void signOut()} className="block w-full rounded-[8px] px-2.5 py-2 text-left text-[13px] text-[#f0b4b4] hover:bg-[var(--sidebar-hover)]">
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

export function SidebarFallback() {
  return <aside className="fixed inset-y-0 left-0 hidden w-[238px] bg-[var(--sidebar-background)] lg:block" />;
}

export function PageFallback() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 rounded-[8px] bg-surface-2" />
      <div className="h-4 w-full max-w-xl rounded-[8px] bg-surface-2" />
      <div className="mt-8 h-48 rounded-[12px] border border-border bg-surface shadow-card" />
    </div>
  );
}
