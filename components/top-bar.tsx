"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Menu, Moon, Search, Sun } from "lucide-react";
import { HistoryBar } from "@/components/history-bar";
import { CommandSearch } from "@/components/command-search";
import { Avatar } from "@/components/avatar";
import { avatarSrc } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/client";
import { displayName } from "@/lib/spaces";
import { WORKSPACE_ROLE_LABELS, workspaceRole } from "@/lib/roles";
import type { Profile } from "@/lib/types";

export function TopBar({
  profile,
  notifUnread,
  operator,
  onMenu,
}: {
  profile: Profile;
  notifUnread: number;
  operator: boolean;
  onMenu: () => void;
}) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("admexo-theme", next ? "dark" : "light");
    setDark(next);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 overflow-visible border-b border-border bg-[var(--app-background)] px-4 md:gap-4 md:px-8">
      <button
        type="button"
        className="grid h-10 w-10 place-items-center rounded-[8px] text-ink hover:bg-surface-2 lg:hidden"
        aria-label="Open navigation"
        onClick={onMenu}
      >
        <Menu size={18} />
      </button>
      <HistoryBar />
      <div className="min-w-0 flex-1">
        <CommandSearch
          open={searchOpen}
          onOpen={() => setSearchOpen(true)}
          onClose={() => setSearchOpen(false)}
          buttonClassName="mx-auto hidden sm:flex"
        />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-[8px] text-muted hover:bg-surface hover:text-ink sm:hidden"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={18} />
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={dark ? "Use light theme" : "Use dark theme"}
          className="grid h-10 w-10 place-items-center rounded-[8px] text-muted transition duration-150 hover:bg-surface hover:text-ink"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <Link
          href="/notifications"
          aria-label="Alerts"
          className="relative grid h-10 w-10 place-items-center rounded-[8px] text-muted transition duration-150 hover:bg-surface hover:text-ink"
        >
          <Bell size={18} />
          {notifUnread > 0 ? (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber" aria-hidden />
          ) : null}
        </Link>
        <div className="relative">
          <button
            type="button"
            aria-expanded={accountOpen}
            aria-label="Account"
            onClick={() => setAccountOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full"
          >
            <Avatar name={displayName(profile)} src={avatarSrc(profile)} size="sm" />
          </button>
          {accountOpen ? (
            <div className="absolute right-0 z-40 mt-2 w-52 rounded-[12px] border border-border bg-surface p-1.5 shadow-float">
              <p className="px-2.5 py-2">
                <span className="block truncate text-[13px] font-semibold text-ink">{displayName(profile)}</span>
                <span className="block text-[12px] leading-[18px] text-muted">{WORKSPACE_ROLE_LABELS[workspaceRole(profile)]}</span>
              </p>
              <Link href="/profile" className="block rounded-[8px] px-2.5 py-2 text-[13px] hover:bg-surface-2" onClick={() => setAccountOpen(false)}>
                Profile
              </Link>
              {operator ? (
                <Link href="/settings" className="block rounded-[8px] px-2.5 py-2 text-[13px] hover:bg-surface-2" onClick={() => setAccountOpen(false)}>
                  Settings
                </Link>
              ) : null}
              <button type="button" onClick={() => void signOut()} className="block w-full rounded-[8px] px-2.5 py-2 text-left text-[13px] text-coral hover:bg-coral-dim">
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
