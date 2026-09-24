import { icons, type LucideIcon } from "lucide-react";

export function normalizeChatIcon(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (!/^[A-Za-z][A-Za-z0-9]{1,63}$/.test(text)) return null;
  return text;
}

export function chatIconList() {
  const names = Object.keys(icons).filter(
    (key) => /^[A-Z]/.test(key) && !key.startsWith("Lucide") && !key.endsWith("Icon")
  );
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

export function chatIconComponent(name: string | null | undefined): LucideIcon | null {
  const key = normalizeChatIcon(name);
  if (!key) return null;
  const Icon = (icons as Record<string, LucideIcon | undefined>)[key];
  return Icon || null;
}

export function chatIconTint(seed: string) {
  const tints = [
    "bg-amber-dim text-amber",
    "bg-teal-dim text-teal",
    "bg-violet-dim text-violet",
    "bg-coral-dim text-coral",
    "bg-surface-2 text-ink",
  ];
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n + seed.charCodeAt(i) * (i + 1)) % tints.length;
  return tints[n];
}

export function missingChatLook(message?: string | null) {
  return /update_chat_look|add_chat_members|remove_chat_member|column .*icon|Could not find the function public\.(update_chat_look|add_chat_members|remove_chat_member)/i.test(
    message || ""
  );
}
