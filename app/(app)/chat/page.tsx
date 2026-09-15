"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, PageHeader, Select } from "@/components/ui";
import { MentionBody, MentionField } from "@/components/mention-field";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { displayName, missingSpacesSchema } from "@/lib/spaces";
import type { ChatMessage, Conversation, ConversationMember, ConversationType, Profile } from "@/lib/types";

type InboxRow = {
  conversation_id: string;
  unread_count: number;
  last_body: string | null;
};

type ConvoRow = Conversation & { last_read_at: string | null; unread: number; last_body: string | null };

function convoLabel(
  convo: Conversation,
  members: ConversationMember[],
  profiles: Record<string, Profile>,
  myId: string
) {
  if (convo.type === "space" || convo.type === "group") return convo.name || (convo.type === "space" ? "Space" : "Group");
  const other = members.find((m) => m.conversation_id === convo.id && m.user_id !== myId);
  return displayName(other ? profiles[other.user_id] : null);
}

function ChatApp() {
  const app = useAppState();
  const router = useRouter();
  const search = useSearchParams();
  const selectedId = search.get("c");
  const [people, setPeople] = useState<Profile[]>([]);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [memberships, setMemberships] = useState<ConversationMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [dmUser, setDmUser] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const myId = app?.userId;

  const profiles = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);

  const rows: ConvoRow[] = useMemo(() => {
    const byId = Object.fromEntries(inbox.map((row) => [row.conversation_id, row]));
    return convos
      .map((convo) => {
        const mine = memberships.find((m) => m.conversation_id === convo.id && m.user_id === myId);
        const info = byId[convo.id];
        return {
          ...convo,
          last_read_at: mine?.last_read_at ?? null,
          unread: info?.unread_count ?? 0,
          last_body: info?.last_body ?? null,
        };
      })
      .sort((a, b) => (b.unread - a.unread) || (b.last_body ? 1 : 0) || a.created_at.localeCompare(b.created_at));
  }, [convos, memberships, myId, inbox]);

  const grouped = useMemo(() => {
    const bucket = (type: ConversationType) => rows.filter((r) => r.type === type);
    return { dm: bucket("dm"), group: bucket("group"), space: bucket("space") };
  }, [rows]);

  async function loadConversations() {
    if (!myId) return;
    const supabase = createClient();
    const [peopleRes, mineRes] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name, role").order("full_name"),
      supabase.from("conversation_members").select("conversation_id, user_id, last_read_at").eq("user_id", myId),
    ]);
    if (mineRes.error) {
      setError(
        missingSpacesSchema(mineRes.error.message)
          ? "Chat is not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor."
          : mineRes.error.message
      );
      return;
    }
    const ids = (mineRes.data ?? []).map((row) => row.conversation_id as string);
    setPeople((peopleRes.data ?? []) as Profile[]);
    if (ids.length === 0) {
      setConvos([]);
      setMemberships([]);
      setInbox([]);
      return;
    }
    const [convRes, memberRes] = await Promise.all([
      supabase.from("conversations").select("*").in("id", ids).order("created_at"),
      supabase.from("conversation_members").select("conversation_id, user_id, last_read_at").in("conversation_id", ids),
    ]);
    setConvos((convRes.data ?? []) as Conversation[]);
    setMemberships((memberRes.data ?? []) as ConversationMember[]);
    const inboxRes = await supabase.rpc("chat_inbox");
    if (!inboxRes.error) setInbox((inboxRes.data ?? []) as InboxRow[]);
  }

  useEffect(() => {
    if (myId) void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  useEffect(() => {
    if (!selectedId || !myId) {
      setMessages([]);
      return;
    }
    const supabase = createClient();
    void (async () => {
      const { data, error: err } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at")
        .limit(200);
      if (err) {
        setError(err.message);
        return;
      }
      setMessages((data ?? []) as ChatMessage[]);
      await supabase.rpc("mark_conversation_read", { p_conversation_id: selectedId });
      const inboxRes = await supabase.rpc("chat_inbox");
      if (!inboxRes.error) setInbox((inboxRes.data ?? []) as InboxRow[]);
    })();

    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          void supabase.rpc("mark_conversation_read", { p_conversation_id: selectedId });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedId, myId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !myId || !body.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("messages")
      .insert({ conversation_id: selectedId, author_id: myId, body: body.trim() })
      .select("*")
      .single();
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessages((prev) => (prev.some((m) => m.id === (data as ChatMessage).id) ? prev : [...prev, data as ChatMessage]));
    setBody("");
  }

  async function startDm(e: React.FormEvent) {
    e.preventDefault();
    if (!dmUser) return;
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("get_or_create_dm", { p_other_user_id: dmUser });
    if (err) {
      setError(err.message);
      return;
    }
    setDmUser("");
    await loadConversations();
    if (typeof data === "string") router.push(`/chat?c=${data}`);
  }

  async function startGroup(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("create_group_conversation", {
      p_name: groupName,
      p_member_ids: groupMembers,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setGroupName("");
    setGroupMembers([]);
    await loadConversations();
    if (typeof data === "string") router.push(`/chat?c=${data}`);
  }

  const selected = convos.find((c) => c.id === selectedId);
  const others = people.filter((p) => p.id !== myId);

  function Section({ title, items }: { title: string; items: ConvoRow[] }) {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <p className="mb-1 px-2 text-[11px] uppercase tracking-[0.18em] text-ink-soft">{title}</p>
        <ul className="space-y-0.5">
          {items.map((convo) => (
            <li key={convo.id}>
              <button
                type="button"
                onClick={() => router.push(`/chat?c=${convo.id}`)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                  convo.id === selectedId ? "bg-terracotta text-white" : convo.unread > 0 ? "text-ink bg-white/5" : "text-ink-soft hover:bg-white/5 hover:text-ink"
                }`}
              >
                {convoLabel(convo, memberships, profiles, myId || "")}
                {convo.unread > 0 ? (
                  <span className="mt-0.5 block truncate text-[11px] opacity-80">
                    {convo.unread} new{convo.last_body ? ` · ${convo.last_body}` : ""}
                  </span>
                ) : convo.last_body ? (
                  <span className="mt-0.5 block truncate text-[11px] opacity-70">{convo.last_body}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!app) return <PageFallback />;

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[28rem] flex-col">
      <PageHeader
        eyebrow="Talk"
        title="Chat"
        description="Direct messages, groups you create, and one channel per Space."
      />
      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-rule bg-cream lg:grid-cols-[280px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b border-rule p-3 lg:border-b-0 lg:border-r">
          <form onSubmit={startDm} className="mb-3 space-y-2">
            <Select value={dmUser} onChange={(e) => setDmUser(e.target.value)}>
              <option value="">New direct message</option>
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p)}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm" variant="secondary" disabled={!dmUser}>
              Open
            </Button>
          </form>
          <form onSubmit={startGroup} className="mb-4 space-y-2 rounded-xl border border-rule p-3">
            <Field label="New group">
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Name" required />
            </Field>
            <Select
              multiple
              value={groupMembers}
              onChange={(e) => setGroupMembers(Array.from(e.target.selectedOptions).map((o) => o.value))}
              className="h-24"
            >
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p)}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm" variant="secondary">
              Create group
            </Button>
          </form>
          <Section title="Direct" items={grouped.dm} />
          <Section title="Groups" items={grouped.group} />
          <Section title="Spaces" items={grouped.space} />
        </aside>
        <section className="flex min-h-0 flex-col">
          {selected ? (
            <>
              <div className="border-b border-rule px-4 py-3">
                <p className="font-medium">{convoLabel(selected, memberships, profiles, myId || "")}</p>
                <p className="text-xs capitalize text-ink-soft">{selected.type === "dm" ? "Direct message" : selected.type}</p>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((message) => (
                  <div key={message.id} className={message.author_id === myId ? "ml-8 text-right" : "mr-8"}>
                    <p className="text-[11px] text-ink-soft">
                      {displayName(profiles[message.author_id])} · {new Date(message.created_at).toLocaleString()}
                    </p>
                    <p className="mt-1 inline-block whitespace-pre-wrap rounded-2xl bg-paper px-3 py-2 text-sm">
                      <MentionBody text={message.body} people={people} />
                    </p>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              <form onSubmit={send} className="border-t border-rule p-3">
                <MentionField
                  value={body}
                  onChange={setBody}
                  people={people}
                  rows={2}
                  placeholder="Message — type @ to mention someone"
                  required
                />
                <div className="mt-2 flex justify-end">
                  <Button type="submit" disabled={busy}>
                    Send
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-ink-soft">
              Pick a conversation, start a DM, or create a group.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <ChatApp />
    </Suspense>
  );
}
