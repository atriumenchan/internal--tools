export type DailyNoteItem = {
  id: string;
  preset: string;
  text: string;
};

export const NOTE_PRESETS: { id: string; n: number; label: string; prompt: string }[] = [
  { id: "done", n: 1, label: "1 · Done today", prompt: "Done today" },
  { id: "open", n: 2, label: "2 · Still open", prompt: "Still open" },
  { id: "waiting", n: 3, label: "3 · Waiting on", prompt: "Waiting on" },
  { id: "help", n: 4, label: "4 · Need help", prompt: "Need help" },
  { id: "note", n: 5, label: "5 · Personal", prompt: "Personal note" },
];

export function newNoteItem(preset: string): DailyNoteItem {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `n-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, preset, text: "" };
}

export function parseNoteItems(value: unknown): DailyNoteItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const text = String(item.text ?? "").trimEnd();
      const preset = String(item.preset ?? "note");
      const id = String(item.id ?? "");
      if (!id) return null;
      return { id, preset, text };
    })
    .filter((row): row is DailyNoteItem => Boolean(row));
}
