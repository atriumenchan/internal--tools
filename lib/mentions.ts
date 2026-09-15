import { displayName } from "@/lib/spaces";
import type { Profile } from "@/lib/types";

export type MentionPerson = Pick<Profile, "id" | "full_name" | "email">;

export function mentionQueryAt(text: string, caret: number) {
  const before = text.slice(0, caret);
  const match = /(?:^|[\s])@([A-Za-z][A-Za-z .'-]{0,60})$/.exec(before);
  if (!match) return null;
  const start = before.lastIndexOf("@");
  return { start, query: match[1] };
}

export function mentionMatches(query: string, people: MentionPerson[]) {
  const q = query.trim().toLowerCase();
  return people
    .filter((person) => displayName(person).toLowerCase().includes(q))
    .slice(0, 8);
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
