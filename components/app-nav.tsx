"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  FileSignature,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Shield,
  SquareKanban,
  Timer,
  Users,
  Settings,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { isAdminEmail } from "@/lib/admin";

const NAV = [
  { href: "/home", label: "Home", icon: Home, adminOnly: false, operatorOnly: false },
  { href: "/spaces", label: "Spaces", icon: SquareKanban, adminOnly: false, operatorOnly: false },
  { href: "/chat", label: "Chat", icon: MessageSquare, adminOnly: false, operatorOnly: false },
  { href: "/notifications", label: "Notifications", icon: Bell, adminOnly: false, operatorOnly: false },
  { href: "/vault", label: "Credentials", icon: KeyRound, adminOnly: false, operatorOnly: false },
  { href: "/dashboard", label: "Board", icon: LayoutDashboard, adminOnly: false, operatorOnly: true },
  { href: "/handbook", label: "Handbook", icon: BookOpen, adminOnly: false, operatorOnly: false },
  { href: "/attendance", label: "Upload", icon: Timer, adminOnly: false, operatorOnly: true },
  { href: "/offers", label: "Offer letters", icon: FileSignature, adminOnly: false, operatorOnly: true },
  { href: "/employees", label: "People", icon: Users, adminOnly: false, operatorOnly: true },
  { href: "/team", label: "Staff", icon: Shield, adminOnly: true, operatorOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: false, operatorOnly: true },
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

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    sessionStorage.removeItem("it-shell-v1");
    sessionStorage.removeItem("it-shell-v2");
    sessionStorage.removeItem("it-shell-v3");
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="no-print flex flex-col border-b border-rule bg-black text-ink lg:min-h-screen lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-5 py-5 lg:block">
        <div>
          <p className="text-xl font-semibold tracking-tight">{companyName || "ADMEXO"}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-ink-soft">Internal</p>
        </div>
        <button
          onClick={signOut}
          className="rounded-full p-2 text-ink-soft hover:bg-white/10 lg:hidden"
          aria-label="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:px-3">
        {NAV.filter((item) => {
          if (item.adminOnly && !(profile.role === "admin" || isAdminEmail(profile.email))) return false;
          if (item.operatorOnly && !operator) return false;
          return true;
        }).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const count = item.href === "/chat" ? chatUnread : item.href === "/notifications" ? notifUnread : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-2 text-sm whitespace-nowrap",
                active ? "bg-terracotta text-white" : "text-ink-soft hover:bg-white/5 hover:text-ink"
              )}
            >
              <Icon size={16} />
              {item.label}
              {count > 0 ? (
                <span
                  className={cn(
                    "ml-auto rounded-full px-1.5 text-[10px]",
                    active ? "bg-white text-terracotta" : "bg-terracotta text-white"
                  )}
                >
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden px-5 py-5 lg:block">
        <p className="truncate text-sm">{profile.full_name || profile.email}</p>
        <p className="text-xs capitalize text-ink-soft">{profile.role}</p>
        <button onClick={signOut} className="mt-3 flex items-center gap-2 text-xs text-ink-soft hover:text-ink">
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}

export function SidebarFallback() {
  return <aside className="no-print min-h-[4.5rem] border-b border-rule bg-black lg:min-h-screen lg:border-b-0 lg:border-r" />;
}

export function PageFallback() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-3 w-24 rounded bg-rule" />
      <div className="h-8 w-64 rounded bg-rule" />
      <div className="h-4 w-full max-w-xl rounded bg-rule/80" />
      <div className="mt-8 h-48 rounded-2xl border border-rule bg-cream" />
    </div>
  );
}
