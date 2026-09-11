"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileSignature, LayoutDashboard, LogOut, Shield, Timer, Users, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, adminOnly: false },
  { href: "/offers", label: "Offer letters", icon: FileSignature, adminOnly: false },
  { href: "/attendance", label: "Attendance", icon: Timer, adminOnly: false },
  { href: "/employees", label: "People", icon: Users, adminOnly: false },
  { href: "/team", label: "Staff", icon: Shield, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: false },
];

export function AppShell({
  profile,
  companyName,
  children,
}: {
  profile: Profile;
  companyName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="no-print flex flex-col border-b border-rule bg-ink text-cream lg:min-h-screen lg:border-b-0 lg:border-r lg:border-ink">
        <div className="flex items-center justify-between px-5 py-5 lg:block">
          <div>
            <p className="font-serif text-xl tracking-tight">{companyName || "Atrium"}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-cream/50">Internal tools</p>
          </div>
          <button
            onClick={signOut}
            className="rounded-full p-2 text-cream/70 hover:bg-white/10 lg:hidden"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:px-3">
          {NAV.filter((item) => !item.adminOnly || profile.role === "admin").map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-2 text-sm whitespace-nowrap",
                  active ? "bg-cream text-ink" : "text-cream/70 hover:bg-white/10 hover:text-cream"
                )}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden px-5 py-5 lg:block">
          <p className="truncate text-sm text-cream">{profile.full_name || profile.email}</p>
          <p className="text-xs capitalize text-cream/50">{profile.role}</p>
          <button
            onClick={signOut}
            className="mt-3 flex items-center gap-2 text-xs text-cream/60 hover:text-cream"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
