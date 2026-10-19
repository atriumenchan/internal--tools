import { ADMIN_DISPLAY_NAME, isAdminUser } from "@/lib/admin";
import { displayName } from "@/lib/spaces";
import type { Profile, Task, TaskComment } from "@/lib/types";

export type MentionPerson = Pick<Profile, "id" | "full_name" | "email"> & { role?: Profile["role"] };

export const EVERYONE_ID = "__everyone__";
export const EVERYONE: MentionPerson = { id: EVERYONE_ID, full_name: "everyone", email: "" };

export function isEveryone(person: MentionPerson | null | undefined) {
  return person?.id === EVERYONE_ID || (person?.full_name || "").trim().toLowerCase() === "everyone";
}

export function mentionQueryAt(text: string, caret: number) {
  const before = text.slice(0, caret);
  const match = /(?:^|[\s])@([A-Za-z][A-Za-z .'-]{0,60})?$/.exec(before);
  if (!match) return null;
  const start = before.lastIndexOf("@");
  return { start, query: match[1] || "" };
}

export function mentionMatches(query: string, people: MentionPerson[]) {
  const q = query.trim().toLowerCase();
  const rows = people
    .filter((person) => !isEveryone(person) && displayName(person).toLowerCase().includes(q))
    .sort((a, b) => {
      const an = displayName(a).toLowerCase();
      const bn = displayName(b).toLowerCase();
      if (q) {
        const aHit = an.startsWith(q) ? 0 : 1;
        const bHit = bn.startsWith(q) ? 0 : 1;
        if (aHit !== bHit) return aHit - bHit;
      }
      return an.localeCompare(bn);
    });
  const showEveryone = !q || "everyone".startsWith(q);
  return showEveryone ? [EVERYONE, ...rows] : rows;
}

export function applyMention(text: string, caret: number, start: number, name: string) {
  const inserted = `@${name} `;
  const next = text.slice(0, start) + inserted + text.slice(caret);
  return { text: next, caret: start + inserted.length };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mentionLabels(people: MentionPerson[]) {
  const names = people.map((p) => displayName(p).trim()).filter(Boolean);
  names.push("everyone");
  const firsts = new Map<string, number>();
  for (const name of names) {
    const first = name.split(/\s+/)[0];
    if (first) firsts.set(first.toLowerCase(), (firsts.get(first.toLowerCase()) || 0) + 1);
  }
  for (const [first, count] of firsts) {
    if (count === 1) {
      const original = names.find((n) => n.split(/\s+/)[0].toLowerCase() === first);
      if (original) names.push(original.split(/\s+/)[0]);
    }
  }
  return [...new Set(names)].sort((a, b) => b.length - a.length);
}

export function splitMentions(text: string, people: MentionPerson[]) {
  const labels = mentionLabels(people);
  if (labels.length === 0 || !text.includes("@")) return [{ mention: false, value: text }];
  const pattern = new RegExp(`(@(?:${labels.map((n) => escapeRegExp(n).replace(/\\s+/g, "\\s+")).join("|")}))`, "gi");
  return text.split(pattern).filter(Boolean).map((part) => ({
    mention: part.startsWith("@"),
    value: part,
  }));
}

/** Same word-boundary rule as public.mention_hit in SQL. */
export function mentionHit(body: string, name: string) {
  const hay = (body || "").toLowerCase();
  const needle = `@${(name || "").trim().toLowerCase()}`;
  if (!needle.slice(1) || !hay.includes(needle)) return false;
  let from = 0;
  while (from <= hay.length) {
    const idx = hay.indexOf(needle, from);
    if (idx < 0) return false;
    const before = idx > 0 ? hay[idx - 1] : "";
    const after = hay[idx + needle.length] || "";
    if (!/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after)) return true;
    from = idx + 1;
  }
  return false;
}

export function commentMentionsUser(body: string, user: MentionPerson, people: MentionPerson[]) {
  if (!(body || "").includes("@")) return false;
  if (mentionHit(body, "everyone")) return true;
  const name = displayName(user);
  if (mentionHit(body, name)) return true;
  if (isAdminUser(user) && (mentionHit(body, "Ryan") || mentionHit(body, ADMIN_DISPLAY_NAME))) return true;
  const first = name.trim().split(/\s+/)[0] || "";
  if (first.length < 2) return false;
  const unique =
    people.filter((person) => displayName(person).trim().split(/\s+/)[0].toLowerCase() === first.toLowerCase()).length === 1;
  return unique && mentionHit(body, first);
}

export type UnrepliedTaskMention = {
  commentId: string;
  taskId: string;
  spaceId: string;
  taskTitle: string;
  authorId: string;
  body: string;
  createdAt: string;
  href: string;
};

export function unrepliedTaskMentions(input: {
  comments: Pick<TaskComment, "id" | "task_id" | "author_id" | "body" | "created_at">[];
  myComments: Pick<TaskComment, "task_id" | "created_at">[];
  me: MentionPerson;
  people: MentionPerson[];
  tasks: Pick<Task, "id" | "space_id" | "title">[];
}): UnrepliedTaskMention[] {
  const taskMap = new Map(input.tasks.map((task) => [task.id, task]));
  const mineByTask = new Map<string, string[]>();
  for (const row of input.myComments) {
    const list = mineByTask.get(row.task_id) || [];
    list.push(row.created_at);
    mineByTask.set(row.task_id, list);
  }

  const rows: UnrepliedTaskMention[] = [];
  for (const comment of input.comments) {
    if (comment.author_id === input.me.id) continue;
    if (!commentMentionsUser(comment.body, input.me, input.people)) continue;
    const replied = (mineByTask.get(comment.task_id) || []).some((at) => at > comment.created_at);
    if (replied) continue;
    const task = taskMap.get(comment.task_id);
    if (!task) continue;
    rows.push({
      commentId: comment.id,
      taskId: task.id,
      spaceId: task.space_id,
      taskTitle: task.title,
      authorId: comment.author_id,
      body: comment.body,
      createdAt: comment.created_at,
      href: `/spaces/${task.space_id}/tasks/${task.id}#comment-${comment.id}`,
    });
  }
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
