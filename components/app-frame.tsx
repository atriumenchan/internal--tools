"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isAdminEmail, isAdminUser } from "@/lib/admin";
import { AppNav, SidebarFallback } from "@/components/app-nav";
import { mustSignHandbook } from "@/lib/handbook";
import type { Profile } from "@/lib/types";

export type AppState = {
  userId: string;
  profile: Profile;
  operator: boolean;
  companyName: string;
  anyoneCanCreateSpaces: boolean;
  handbookAcknowledged: boolean;
};

const AppStateContext = createContext<AppState | null>(null);
const CACHE_KEY = "it-shell-v3";

function readCache(): AppState | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}

export function useAppState() {
  return useContext(AppStateContext);
}

export function AppFrame({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const cached = readCache();
    if (cached) setState(cached);

    const supabase = createClient();
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        window.location.href = "/login";
        return;
      }

      const profileFull = await supabase
        .from("profiles")
        .select("id, email, full_name, role, handbook_version, handbook_acknowledged_at")
        .eq("id", user.id)
        .maybeSingle();

      const profileBasic =
        profileFull.error
          ? await supabase.from("profiles").select("id, email, full_name, role").eq("id", user.id).maybeSingle()
          : profileFull;

      const settingsFull = await supabase
        .from("company_settings")
        .select("company_name, handbook_version, anyone_can_create_spaces")
        .eq("id", 1)
        .maybeSingle();

      const settingsBasic =
        settingsFull.error
          ? await supabase.from("company_settings").select("company_name").eq("id", 1).maybeSingle()
          : settingsFull;

      const { data: linked } = await supabase.from("employees").select("id").eq("user_id", user.id).maybeSingle();

      const profileRow = (profileBasic.data ?? null) as Profile | null;
      const settingsRow = settingsBasic.data as {
        company_name?: string;
        handbook_version?: string;
        anyone_can_create_spaces?: boolean;
      } | null;

      const schemaReady = !profileFull.error && !settingsFull.error;
      const resolved: Profile = profileRow ?? {
        id: user.id,
        email: user.email ?? "",
        full_name: "",
        role: isAdminEmail(user.email) ? "admin" : "employee",
      };
      const acknowledged =
        !schemaReady ||
        !mustSignHandbook({
          role: resolved.role,
          email: resolved.email || user.email,
          handbookVersion: resolved.handbook_version,
          requiredVersion: settingsRow?.handbook_version,
        });

      const next: AppState = {
        userId: user.id,
        profile: resolved,
        operator: isAdminUser({ email: user.email, role: resolved.role }) || !linked,
        companyName: settingsRow?.company_name ?? "ADMEXO",
        anyoneCanCreateSpaces: settingsRow?.anyone_can_create_spaces !== false,
        handbookAcknowledged: acknowledged,
      };
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(next));
      setState(next);
    })();
  }, []);

  useEffect(() => {
    if (state && !state.handbookAcknowledged) {
      router.replace("/acknowledge");
    }
  }, [state, router, pathname]);

  useEffect(() => {
    if (!state?.handbookAcknowledged) {
      setChatUnread(0);
      setNotifUnread(0);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    async function loadBadges() {
      const [chat, notifs] = await Promise.all([
        supabase.rpc("chat_unread_count"),
        supabase.rpc("unread_notification_count"),
      ]);
      if (cancelled) return;
      if (!chat.error && typeof chat.data === "number") setChatUnread(chat.data);
      if (!notifs.error && typeof notifs.data === "number") setNotifUnread(notifs.data);
    }

    void loadBadges();
    const channel = supabase
      .channel("nav-badges")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void loadBadges();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        void loadBadges();
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [state?.handbookAcknowledged]);

  if (!state || !state.handbookAcknowledged) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-sm text-ink-soft">
        {state && !state.handbookAcknowledged ? "Opening the handbook…" : "Loading…"}
      </div>
    );
  }

  return (
    <AppStateContext.Provider value={state}>
      <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[256px_1fr]">
        {state ? (
          <AppNav
            profile={state.profile}
            companyName={state.companyName}
            operator={state.operator}
            chatUnread={chatUnread}
            notifUnread={notifUnread}
          />
        ) : (
          <SidebarFallback />
        )}
        <main className="min-w-0 bg-paper px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </AppStateContext.Provider>
  );
}
