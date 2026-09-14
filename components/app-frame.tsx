"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { isAdminEmail, isAdminUser } from "@/lib/admin";
import { AppNav, SidebarFallback } from "@/components/app-nav";
import type { Profile } from "@/lib/types";

export type AppState = {
  userId: string;
  profile: Profile;
  operator: boolean;
  companyName: string;
};

const AppStateContext = createContext<AppState | null>(null);
const CACHE_KEY = "it-shell-v1";

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
      const [{ data: profile }, { data: linked }, { data: settings }] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, role").eq("id", user.id).maybeSingle(),
        supabase.from("employees").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("company_settings").select("company_name").eq("id", 1).maybeSingle(),
      ]);
      const resolved: Profile = (profile as Profile) ?? {
        id: user.id,
        email: user.email ?? "",
        full_name: "",
        role: isAdminEmail(user.email) ? "admin" : "hr",
      };
      const next: AppState = {
        userId: user.id,
        profile: resolved,
        operator: isAdminUser({ email: user.email, role: resolved.role }) || !linked,
        companyName: (settings as { company_name?: string } | null)?.company_name ?? "Atrium",
      };
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(next));
      setState(next);
    })();
  }, []);

  return (
    <AppStateContext.Provider value={state}>
      <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
        {state ? (
          <AppNav profile={state.profile} companyName={state.companyName} operator={state.operator} />
        ) : (
          <SidebarFallback />
        )}
        <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </AppStateContext.Provider>
  );
}
