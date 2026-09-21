import { createClient } from "@/lib/supabase/client";
import { isIgnoredEmployee } from "@/lib/admin";
import type { ChatBootstrap, Conversation, ConversationMember, Employee, Profile, StaffUser } from "@/lib/types";

export async function loadChatBootstrap(userId: string): Promise<ChatBootstrap> {
  const supabase = createClient();
  const [peopleRes, mineRes] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role").order("full_name"),
    supabase.from("conversation_members").select("conversation_id, user_id, last_read_at").eq("user_id", userId),
  ]);
  const people = (peopleRes.data ?? []) as Profile[];
  if (mineRes.error) {
    throw new Error(mineRes.error.message);
  }
  const ids = (mineRes.data ?? []).map((row) => row.conversation_id as string);
  if (ids.length === 0) {
    return { people, convos: [], memberships: [], inbox: [] };
  }
  const [convRes, memberRes, inboxRes] = await Promise.all([
    supabase.from("conversations").select("*").in("id", ids).order("created_at"),
    supabase.from("conversation_members").select("conversation_id, user_id, last_read_at").in("conversation_id", ids),
    supabase.rpc("chat_inbox"),
  ]);
  return {
    people,
    convos: (convRes.data ?? []) as Conversation[],
    memberships: (memberRes.data ?? []) as ConversationMember[],
    inbox: inboxRes.error ? [] : ((inboxRes.data ?? []) as ChatBootstrap["inbox"]),
  };
}

export async function loadEmployees(): Promise<Employee[]> {
  const supabase = createClient();
  const { data } = await supabase.from("employees").select("*").order("employee_code");
  return ((data ?? []) as Employee[]).filter((e) => !e.ignored && e.is_active !== false && !isIgnoredEmployee(e.employee_code, e.full_name));
}

export async function loadStaffBundle(): Promise<{ users: StaffUser[]; employees: Employee[] } | { error: string }> {
  const res = await fetch("/api/users");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json.error || "Could not load users" };
  const employees = ((json.employees ?? []) as Employee[]).filter(
    (e) => !e.ignored && e.is_active !== false && !isIgnoredEmployee(e.employee_code, e.full_name)
  );
  return { users: (json.users ?? []) as StaffUser[], employees };
}
