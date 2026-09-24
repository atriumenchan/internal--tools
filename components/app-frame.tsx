"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isAdminEmail, isAdminUser } from "@/lib/admin";
import { AppNav, SidebarFallback } from "@/components/app-nav";
import { mustSignHandbook } from "@/lib/handbook";
import { loadChatBootstrap, loadEmployees, loadStaffBundle } from "@/lib/chat-bootstrap";
import { missingSpacesSchema } from "@/lib/spaces";
import type { ChatBootstrap, Employee, Profile, StaffUser } from "@/lib/types";

export type AppState = {
  userId: string;
  profile: Profile;
  operator: boolean;
  companyName: string;
  anyoneCanCreateSpaces: boolean;
  handbookAcknowledged: boolean;
};

export type WorkspaceCache = {
  employees: Employee[];
  staffUsers: StaffUser[] | null;
  staffError: string | null;
  chat: ChatBootstrap | null;
  chatError: string | null;
  ready: boolean;
  refreshStaff: () => Promise<void>;
  refreshChat: () => Promise<void>;
  refreshBadges: () => Promise<void>;
};

const AppStateContext = createContext<AppState | null>(null);
const WorkspaceContext = createContext<WorkspaceCache | null>(null);
const CACHE_KEY = "it-shell-v5";
const WORK_KEY = "it-workspace-v1";

function readCache(): AppState | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}

function readWork(): Partial<WorkspaceCache> | null {
  try {
    const raw = sessionStorage.getItem(WORK_KEY);
    return raw ? (JSON.parse(raw) as Partial<WorkspaceCache>) : null;
  } catch {
    return null;
  }
}

function writeWork(next: { employees: Employee[]; staffUsers: StaffUser[] | null; chat: ChatBootstrap | null }) {
  sessionStorage.setItem(WORK_KEY, JSON.stringify(next));
}

export function useAppState() {
  return useContext(AppStateContext);
}

export function useWorkspaceCache() {
  return useContext(WorkspaceContext);
}

export function AppFrame({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[] | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatBootstrap | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      if (isAdminUser(cached.profile)) setState({ ...cached, handbookAcknowledged: true });
      else setState(cached);
    }
    const work = readWork();
    if (work?.employees) setEmployees(work.employees);
    if (work?.staffUsers) setStaffUsers(work.staffUsers);
    if (work?.chat) setChat(work.chat);

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
        isAdminUser({ email: resolved.email || user.email, role: resolved.role }) ||
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
    if (state && !state.handbookAcknowledged && !isAdminUser(state.profile)) {
      router.replace("/acknowledge");
    }
  }, [state, router, pathname]);

  async function refreshStaff() {
    if (!state || !isAdminUser(state.profile)) return;
    const bundle = await loadStaffBundle();
    if ("error" in bundle) {
      setStaffError(bundle.error);
      const roster = await loadEmployees();
      setEmployees(roster);
      writeWork({ employees: roster, staffUsers, chat });
      return;
    }
    setStaffError(null);
    setStaffUsers(bundle.users);
    setEmployees(bundle.employees);
    writeWork({ employees: bundle.employees, staffUsers: bundle.users, chat });
  }

  async function refreshChat() {
    if (!state) return;
    try {
      const next = await loadChatBootstrap(state.userId);
      setChatError(null);
      setChat(next);
      writeWork({ employees, staffUsers, chat: next });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load chat";
      setChatError(
        missingSpacesSchema(message) ? "Chat is not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor." : message
      );
    }
  }

  async function refreshBadges() {
    const supabase = createClient();
    const [chatCount, notifs] = await Promise.all([
      supabase.rpc("chat_unread_count"),
      supabase.rpc("unread_notification_count"),
    ]);
    if (!chatCount.error && typeof chatCount.data === "number") setChatUnread(chatCount.data);
    if (!notifs.error && typeof notifs.data === "number") setNotifUnread(notifs.data);
  }

  useEffect(() => {
    if (!state?.handbookAcknowledged) return;
    let cancelled = false;
    void (async () => {
      const admin = isAdminUser(state.profile);
      const [roster, staff, inbox] = await Promise.all([
        admin ? Promise.resolve(null) : loadEmployees().catch(() => [] as Employee[]),
        admin ? loadStaffBundle() : Promise.resolve(null),
        loadChatBootstrap(state.userId).catch((e) => e as Error),
      ]);
      if (cancelled) return;
      if (staff && "error" in staff) {
        setStaffError(staff.error);
        const fallback = roster ?? (await loadEmployees().catch(() => [] as Employee[]));
        setEmployees(fallback);
      } else if (staff && "users" in staff) {
        setStaffError(null);
        setStaffUsers(staff.users);
        setEmployees(staff.employees);
      } else {
        setEmployees(roster ?? []);
      }
      if (inbox instanceof Error) {
        setChatError(
          missingSpacesSchema(inbox.message)
            ? "Chat is not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor."
            : inbox.message
        );
      } else {
        setChat(inbox);
        setChatError(null);
      }
      const emp = staff && "employees" in staff ? staff.employees : roster ?? [];
      const users = staff && "users" in staff ? staff.users : staffUsers;
      const chatNext = inbox instanceof Error ? chat : inbox;
      writeWork({ employees: emp, staffUsers: users, chat: chatNext });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.userId, state?.handbookAcknowledged, state?.profile.id]);

  useEffect(() => {
    if (!state?.handbookAcknowledged) {
      setChatUnread(0);
      setNotifUnread(0);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    async function loadBadges() {
      const [chatCount, notifs] = await Promise.all([
        supabase.rpc("chat_unread_count"),
        supabase.rpc("unread_notification_count"),
      ]);
      if (cancelled) return;
      if (!chatCount.error && typeof chatCount.data === "number") setChatUnread(chatCount.data);
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

  const inApp = Boolean(state && (state.handbookAcknowledged || isAdminUser(state.profile)));
  if (!inApp) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-sm text-muted">
        {state && !state.handbookAcknowledged ? "Opening the handbook…" : "Loading…"}
      </div>
    );
  }

  const workspace: WorkspaceCache = {
    employees,
    staffUsers,
    staffError,
    chat,
    chatError,
    ready,
    refreshStaff,
    refreshChat,
    refreshBadges,
  };

  return (
    <AppStateContext.Provider value={state}>
      <WorkspaceContext.Provider value={workspace}>
        <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[256px_1fr]">
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
          <main className="min-w-0 bg-page px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </WorkspaceContext.Provider>
    </AppStateContext.Provider>
  );
}
