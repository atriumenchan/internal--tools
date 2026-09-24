"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VideoCamera } from "@phosphor-icons/react/dist/ssr/VideoCamera";
import { createClient } from "@/lib/supabase/client";
import { Button, ErrorText, Field, Input, PageHeader, Select } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { MentionBody, MentionField } from "@/components/mention-field";
import { ConversationMark } from "@/components/conversation-mark";
import { PageFallback } from "@/components/app-nav";
import { useAppState, useWorkspaceCache } from "@/components/app-frame";
import { isAdminUser } from "@/lib/admin";
import { loadChatBootstrap } from "@/lib/chat-bootstrap";
import { displayName, missingSpacesSchema } from "@/lib/spaces";
import { COMPANY_MEET_URL } from "@/lib/office-links";
import type { ChatInboxRow, ChatMessage, Conversation, ConversationMember, ConversationType, Profile } from "@/lib/types";

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

function memberNames(
  convo: Conversation,
  members: ConversationMember[],
  profiles: Record<string, Profile>,
  myId: string
) {
  const ids = members.filter((m) => m.conversation_id === convo.id).map((m) => m.user_id);
  const others = ids.filter((id) => id !== myId);
  const source = others.length ? others : ids;
  return source.map((id) => displayName(profiles[id]));
}

function memberCount(convo: Conversation, members: ConversationMember[]) {
  return members.filter((m) => m.conversation_id === convo.id).length;
}

function GroupPeople({ names, total }: { names: string[]; total: number }) {
  const [open, setOpen] = useState(false);
  const extra = Math.max(0, names.length - 2);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
      >
        <UsersThree size={14} weight="light" />
        {total} {total === 1 ? "person" : "people"}
        {extra > 0 ? <span className="rounded-sm bg-surface-2 px-1 font-mono text-[10px]">+{extra}</span> : null}
      </button>
      {open ? (
        <ul className="absolute top-full left-0 z-20 mt-1 min-w-[10rem] rounded-md border border-border bg-surface p-2 text-xs shadow-card">
          {names.map((name) => (
            <li key={name} className="px-1 py-1 text-ink">
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChatApp() {
  const app = useAppState();
  const cache = useWorkspaceCache();
  const router = useRouter();
  const search = useSearchParams();
  const selectedId = search.get("c");
  const [people, setPeople] = useState<Profile[]>(cache?.chat?.people ?? []);
  const [convos, setConvos] = useState<Conversation[]>(cache?.chat?.convos ?? []);
  const [memberships, setMemberships] = useState<ConversationMember[]>(cache?.chat?.memberships ?? []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(cache?.chatError ?? null);
  const [body, setBody] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [compose, setCompose] = useState<"idle" | "dm" | "group">("idle");
  const [inbox, setInbox] = useState<ChatInboxRow[]>(cache?.chat?.inbox ?? []);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const myId = app?.userId;

  const employees = cache?.employees ?? [];

  const chatPeople = useMemo(() => {
    const byId = new Map<string, Profile>();
    for (const person of people) byId.set(person.id, person);
    for (const employee of employees) {
      if (!employee.user_id || byId.has(employee.user_id)) continue;
      byId.set(employee.user_id, {
        id: employee.user_id,
        email: employee.email || "",
        full_name: employee.full_name,
        role: "employee",
      });
    }
    return [...byId.values()];
  }, [people, employees]);

  const profiles = useMemo(() => Object.fromEntries(chatPeople.map((p) => [p.id, p])), [chatPeople]);

  const dmOptions = useMemo(() => {
    const rows: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const employee of [...employees].sort((a, b) =>
      a.employee_code.localeCompare(b.employee_code, undefined, { numeric: true })
    )) {
      if (!employee.user_id || employee.user_id === myId) continue;
      seen.add(employee.user_id);
      rows.push({ id: employee.user_id, label: `${employee.employee_code} · ${employee.full_name}` });
    }
    for (const person of chatPeople) {
      if (!person.id || person.id === myId || seen.has(person.id)) continue;
      rows.push({ id: person.id, label: displayName(person) });
    }
    return rows;
  }, [employees, chatPeople, myId]);

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
      .sort((a, b) => b.unread - a.unread || (b.last_body ? 1 : 0) || a.created_at.localeCompare(b.created_at));
  }, [convos, memberships, myId, inbox]);

  const grouped = useMemo(() => {
    const bucket = (type: ConversationType) => rows.filter((r) => r.type === type);
    return { dm: bucket("dm"), group: bucket("group"), space: bucket("space") };
  }, [rows]);

  function applyBootstrap(next: NonNullable<typeof cache>["chat"]) {
    if (!next) return;
    setPeople(next.people);
    setConvos(next.convos);
    setMemberships(next.memberships);
    setInbox(next.inbox);
  }

  async function loadConversations() {
    if (!myId) return;
    try {
      const next = await loadChatBootstrap(myId);
      applyBootstrap(next);
      await cache?.refreshChat();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load chat";
      setError(missingSpacesSchema(message) ? "Chat is not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor." : message);
    }
  }

  useEffect(() => {
    if (cache?.chat) applyBootstrap(cache.chat);
    if (cache?.chatError) setError(cache.chatError);
  }, [cache?.chat, cache?.chatError]);

  useEffect(() => {
    if (myId && !cache?.chat) void loadConversations();
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
      setInbox((prev) => prev.map((row) => (row.conversation_id === selectedId ? { ...row, unread_count: 0 } : row)));
      const inboxRes = await supabase.rpc("chat_inbox");
      if (!inboxRes.error) setInbox((inboxRes.data ?? []) as ChatInboxRow[]);
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("href", `/chat?c=${selectedId}`).is("read_at", null);
      await cache?.refreshBadges();
    })();

    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          void supabase.rpc("mark_conversation_read", { p_conversation_id: selectedId }).then(() => {
            void cache?.refreshBadges();
          });
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
    await cache?.refreshChat();
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
  const admin = app ? isAdminUser(app.profile) : false;
  const selectedNames = selected ? memberNames(selected, memberships, profiles, myId || "") : [];
  const selectedCount = selected ? memberCount(selected, memberships) : 0;

  function Section({ title, items }: { title: string; items: ConvoRow[] }) {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <p className="mb-1 px-2 text-[11px] font-medium tracking-[0.07em] text-faint uppercase">{title}</p>
        <ul className="space-y-0.5">
          {items.map((convo) => {
            const label = convoLabel(convo, memberships, profiles, myId || "");
            const names = memberNames(convo, memberships, profiles, myId || "");
            const count = memberCount(convo, memberships);
            const active = convo.id === selectedId;
            return (
              <li key={convo.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => router.push(`/chat?c=${convo.id}`)}
                  className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition duration-200 ${
                    active
                      ? "bg-amber-dim text-ink"
                      : convo.unread > 0
                        ? "bg-teal-dim text-ink"
                        : "text-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <ConversationMark type={convo.type} names={names.length ? names : [label]} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{label}</span>
                      {convo.type === "group" ? (
                        <span className="shrink-0 font-mono text-[10px] text-faint">{count}</span>
                      ) : null}
                      {convo.unread > 0 ? (
                        <span className={`rounded-sm px-1.5 font-mono text-[10px] font-medium ${active ? "bg-amber-dim text-amber" : "bg-teal-dim text-teal"}`}>
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

  const composerHint =
    selected?.type === "space"
      ? "Message the board — type @ to mention someone"
      : selected?.type === "group"
        ? "Message the group — type @ to mention someone"
        : `Message ${selected ? convoLabel(selected, memberships, profiles, myId || "") : ""} — type @ to mention someone`;

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[28rem] flex-col">
      <PageHeader title="Chat" description="Message someone, or make a group. Each task board also has a channel here." />
      <a
        href={COMPANY_MEET_URL}
        target="_blank"
        rel="noreferrer"
        className="mb-3 flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2 text-[13px] shadow-card transition duration-150 hover:border-amber-line hover:bg-surface-2"
      >
        <VideoCamera size={18} weight="light" className="shrink-0 text-teal" />
        <span className="min-w-0 flex-1">
          <span className="font-medium text-ink">Company Meet</span>
          <span className="mt-0.5 block truncate text-[12px] text-muted">Same room every time — tap to join</span>
        </span>
        <span className="shrink-0 text-[12px] font-medium text-teal">Join</span>
      </a>
      <ErrorText className="mb-3">{error}</ErrorText>
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-surface shadow-card lg:grid-cols-[280px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b border-border p-3 lg:border-b-0 lg:border-r">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant={compose === "dm" ? "primary" : "secondary"} onClick={() => setCompose(compose === "dm" ? "idle" : "dm")}>
              New chat
            </Button>
            <Button type="button" size="sm" variant={compose === "group" ? "primary" : "secondary"} onClick={() => setCompose(compose === "group" ? "idle" : "group")}>
              New group
            </Button>
          </div>
          {compose === "dm" ? (
            <div className="mb-4 rounded-md border border-border bg-page p-3">
              <Field label="Pick a person">
                <Select
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) void openDm(id);
                  }}
                >
                  <option value="">{dmOptions.length === 0 ? "No people with a login yet." : "Select a person"}</option>
                  {dmOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
          {compose === "group" ? (
            <form onSubmit={startGroup} className="mb-4 space-y-3 rounded-md border border-border bg-page p-3">
              <Field label="Group name">
                <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Ops" required />
              </Field>
              <Field label="Add people">
                <div className="flex flex-wrap gap-2">
                  <Select
                    className="min-w-[12rem] flex-1"
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id && !groupMembers.includes(id)) setGroupMembers([...groupMembers, id]);
                    }}
                  >
                    <option value="">{dmOptions.length === 0 ? "No people with a login yet." : "Select a person"}</option>
                    {dmOptions
                      .filter((person) => !groupMembers.includes(person.id))
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.label}
                        </option>
                      ))}
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={dmOptions.length === 0 || groupMembers.length === dmOptions.length}
                    onClick={() => setGroupMembers(dmOptions.map((person) => person.id))}
                  >
                    Add everyone
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted">You are in the group already. Add everyone, or pick people one by one.</p>
              </Field>
              {groupMembers.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {groupMembers.map((id) => {
                    const label = dmOptions.find((p) => p.id === id)?.label || displayName(profiles[id]);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setGroupMembers(groupMembers.filter((x) => x !== id))}
                        className="rounded-sm bg-teal-dim px-2 py-0.5 text-[11px] font-medium text-teal"
                      >
                        {label} ×
                      </button>
                    );
                  })}
                </div>
              ) : null}
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
              <div
                className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${
                  selected.type === "space"
                    ? "border-teal bg-teal-dim"
                    : selected.type === "group"
                      ? "border-border bg-surface-2"
                      : "border-border bg-surface"
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <ConversationMark type={selected.type} names={selectedNames.length ? selectedNames : [convoLabel(selected, memberships, profiles, myId || "")]} />
                  <div className="min-w-0">
                    <p className="font-medium">{convoLabel(selected, memberships, profiles, myId || "")}</p>
                    {selected.type === "group" ? (
                      <GroupPeople names={selectedNames} total={selectedCount || selectedNames.length} />
                    ) : (
                      <p className="text-xs text-muted">
                        {selected.type === "dm" ? "Direct message" : "Board channel"}
                      </p>
                    )}
                  </div>
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
                      <p className="font-mono text-[11px] text-muted">
                        {displayName(profiles[message.author_id])} · {new Date(message.created_at).toLocaleString()}
                      </p>
                      <div className={`mt-1 inline-flex max-w-full items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                        <p
                          className={`whitespace-pre-wrap rounded-md px-3 py-2 text-left text-sm ${
                            mine
                              ? "bg-amber-dim text-ink ring-1 ring-amber-line"
                              : "bg-surface-2 text-ink ring-1 ring-border"
                          }`}
                        >
                          <MentionBody text={message.body} people={chatPeople} />
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
              <form
                onSubmit={send}
                className={`border-t p-3 ${
                  selected.type === "space"
                    ? "border-teal bg-teal-dim"
                    : selected.type === "group"
                      ? "border-border bg-surface-2"
                      : "border-border bg-page"
                }`}
              >
                <MentionField value={body} onChange={setBody} people={chatPeople} rows={2} placeholder={composerHint} required />
                <div className="mt-2 flex justify-end">
                  <Button type="submit" disabled={busy}>
                    Send
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-faint">
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
