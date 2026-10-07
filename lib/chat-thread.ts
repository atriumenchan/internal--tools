import { kolkataDateKeyFromInstant, kolkataTodayKey } from "@/lib/datetime";
import type { ChatMessage } from "@/lib/types";

const CLUSTER_MS = 5 * 60_000;

export function isChatImage(type?: string | null, name?: string | null) {
  if ((type || "").toLowerCase().startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name || "");
}

export function chatPreview(message: { body?: string | null; file_name?: string | null; file_type?: string | null } | null) {
  const body = (message?.body || "").trim();
  if (body) return body;
  if (!message?.file_name) return "";
  return isChatImage(message.file_type, message.file_name) ? "Photo" : message.file_name;
}

export function inboxPreview(body?: string | null) {
  const text = (body || "").trim();
  if (!text) return "";
  if (text.startsWith("__photo__:")) return "Photo";
  if (text.startsWith("__file__:")) return text.slice(8) || "File";
  return text;
}

export function dayLabel(value: string, today = kolkataTodayKey()) {
  const key = kolkataDateKeyFromInstant(value);
  if (!key) return "";
  if (key === today) return "Today";
  const yest = new Date(`${today}T12:00:00.000Z`);
  yest.setUTCDate(yest.getUTCDate() - 1);
  if (key === yest.toISOString().slice(0, 10)) return "Yesterday";
  const date = new Date(`${key}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

export type MessageCluster = {
  authorId: string;
  day: string;
  messages: ChatMessage[];
};

export function clusterMessages(messages: ChatMessage[]): MessageCluster[] {
  const clusters: MessageCluster[] = [];
  for (const message of messages) {
    const day = kolkataDateKeyFromInstant(message.created_at) || "";
    const last = clusters[clusters.length - 1];
    const close =
      last &&
      last.authorId === message.author_id &&
      last.day === day &&
      new Date(message.created_at).getTime() - new Date(last.messages[last.messages.length - 1].created_at).getTime() <=
        CLUSTER_MS;
    if (close) last.messages.push(message);
    else clusters.push({ authorId: message.author_id, day, messages: [message] });
  }
  return clusters;
}
