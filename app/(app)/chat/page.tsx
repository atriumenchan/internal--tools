"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, ErrorText, Field, Input, PageHeader } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { MentionBody, MentionField } from "@/components/mention-field";
import { PeoplePicker } from "@/components/people-picker";
import { Avatar } from "@/components/avatar";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { isAdminUser } from "@/lib/admin";
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
  if (convo.type === "space" || convo.type === "group") return convo.name || (convo.type === "space" ? "Board" : "Group");
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
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [compose, setCompose] = useState<"idle" | "dm" | "group">("idle");
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

  async function openDm(userId: string) {
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("get_or_create_dm", { p_other_user_id: userId });
    if (err) {
      setError(err.message);
      return;
    }
    setCompose("idle");
    await loadConversations();
    if (typeof data === "string") router.push(`/chat?c=${data}`);
  }

  async function startGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName.trim() || groupMembers.length === 0) return;
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("create_group_conversation", {
      p_name: groupName.trim(),
      p_member_ids: groupMembers,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setGroupName("");
    setGroupMembers([]);
    setCompose("idle");
    await loadConversations();
    if (typeof data === "string") router.push(`/chat?c=${data}`);
  }

  async function deleteConversation(conversationId: string, type: ConversationType) {
    if (type === "space") return;
    const supabase = createClient();
    const { error: err } = await supabase.from("conversations").delete().eq("id", conversationId);
    if (err) {
      setError(
        err.message.includes("row-level security") || err.message.includes("policy")
          ? "Could not delete this chat. Paste supabase/deletes.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      return;
    }
    setConvos((prev) => prev.filter((c) => c.id !== conversationId));
    setMessages((prev) => (selectedId === conversationId ? [] : prev));
    if (selectedId === conversationId) router.push("/chat");
  }

  async function deleteMessage(messageId: string) {
    const supabase = createClient();
    const { error: err } = await supabase.from("messages").delete().eq("id", messageId);
    if (err) {
      setError(
        err.message.includes("row-level security") || err.message.includes("policy")
          ? "Could not delete this message. Paste supabase/deletes.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }

  const selected = convos.find((c) => c.id === selectedId);
  const others = people.filter((p) => p.id !== myId);
  const admin = app ? isAdminUser(app.profile) : false;

  function Section({ title, items }: { title: string; items: ConvoRow[] }) {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <p className="mb-1 px-2 text-[11px] uppercase tracking-[0.18em] text-ink-soft">{title}</p>
        <ul className="space-y-0.5">
          {items.map((convo) => {
            const label = convoLabel(convo, memberships, profiles, myId || "");
            const active = convo.id === selectedId;
            return (
              <li key={convo.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => router.push(`/chat?c=${convo.id}`)}
                  className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition duration-200 ${
                    active
                      ? "bg-terracotta/12 text-ink"
                      : convo.unread > 0
                        ? "bg-blue/5 text-ink"
                        : "text-ink-soft hover:bg-white/[0.04] hover:text-ink"
                  }`}
                >
                  <Avatar name={label} size="sm" className={active ? "bg-white/20" : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{label}</span>
                      {convo.unread > 0 ? (
                        <span className={`rounded-md px-1.5 text-[10px] font-semibold ${active ? "bg-terracotta/20 text-terracotta" : "bg-blue/15 text-blue-soft"}`}>
                          {convo.unread}
                        </span>
                      ) : null}
                    </span>
                    {convo.last_body ? (
                      <span className="mt-0.5 block truncate text-[11px] opacity-70">{convo.last_body}</span>
                    ) : null}
                  </span>
                </button>
                {convo.type !== "space" ? (
                  <ConfirmDelete
                    align="left"
                    label={convo.type === "group" ? "Delete group" : "Delete chat"}
                    title={convo.type === "group" ? "Delete this group?" : "Delete this chat?"}
                    description="All messages in this conversation will be removed."
                    onConfirm={() => deleteConversation(convo.id, convo.type)}
                    className="opacity-70 transition duration-200 group-hover:opacity-100"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (!app) return <PageFallback />;

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[28rem] flex-col">
      <PageHeader title="Chat" description="Message someone, or make a group. Each task board also has a channel here." />
      <ErrorText className="mb-3">{error}</ErrorText>
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-rule bg-cream shadow-card lg:grid-cols-[280px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b border-rule p-3 lg:border-b-0 lg:border-r">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant={compose === "dm" ? "primary" : "secondary"} onClick={() => setCompose(compose === "dm" ? "idle" : "dm")}>
              New chat
            </Button>
            <Button type="button" size="sm" variant={compose === "group" ? "primary" : "secondary"} onClick={() => setCompose(compose === "group" ? "idle" : "group")}>
              New group
            </Button>
          </div>
          {compose === "dm" ? (
            <div className="mb-4 rounded-[12px] border border-rule bg-surface p-2">
              <p className="px-1 pb-2 text-xs text-ink-soft">Pick a person</p>
              <ul className="max-h-56 overflow-y-auto">
                {others.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => void openDm(p.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-white/5"
                    >
                      <Avatar name={displayName(p)} size="sm" />
                      {displayName(p)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {compose === "group" ? (
            <form onSubmit={startGroup} className="mb-4 space-y-3 rounded-[12px] border border-rule bg-surface p-3">
              <Field label="Group name">
                <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Ops" required />
              </Field>
              <PeoplePicker people={others} selected={groupMembers} onChange={setGroupMembers} placeholder="Add people" />
              <Button type="submit" size="sm" disabled={!groupName.trim() || groupMembers.length === 0}>
                Create group
              </Button>
            </form>
          ) : null}
          <Section title="Direct" items={grouped.dm} />
          <Section title="Groups" items={grouped.group} />
          <Section title="Boards" items={grouped.space} />
        </aside>
        <section className="flex min-h-0 flex-col">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
                <div>
                  <p className="font-medium">{convoLabel(selected, memberships, profiles, myId || "")}</p>
                  <p className="text-xs capitalize text-ink-soft">
                    {selected.type === "dm" ? "Direct message" : selected.type === "space" ? "Board channel" : "Group"}
                  </p>
                </div>
                {selected.type !== "space" ? (
                  <ConfirmDelete
                    label={selected.type === "group" ? "Delete group" : "Delete chat"}
                    title={selected.type === "group" ? "Delete this group?" : "Delete this chat?"}
                    description="All messages in this conversation will be removed."
                    onConfirm={() => deleteConversation(selected.id, selected.type)}
                  />
                ) : null}
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((message) => {
                  const mine = message.author_id === myId;
                  const canDelete = mine || admin;
                  return (
                    <div key={message.id} className={mine ? "ml-8 text-right" : "mr-8"}>
                      <p className="text-[11px] text-muted">
                        {displayName(profiles[message.author_id])} · {new Date(message.created_at).toLocaleString()}
                      </p>
                      <div className={`mt-1 inline-flex max-w-full items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                        <p
                          className={`whitespace-pre-wrap rounded-[12px] px-3 py-2 text-left text-sm ${
                            mine
                              ? "bg-terracotta/15 text-ink ring-1 ring-terracotta/25"
                              : "bg-elevated text-ink ring-1 ring-rule"
                          }`}
                        >
                          <MentionBody text={message.body} people={people} />
                        </p>
                        {canDelete ? (
                          <ConfirmDelete
                            align={mine ? "right" : "left"}
                            label="Delete message"
                            title="Delete this message?"
                            onConfirm={() => deleteMessage(message.id)}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottom} />
              </div>
              <form onSubmit={send} className="border-t border-rule bg-surface p-3">
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
