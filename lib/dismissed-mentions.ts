const KEY = (userId: string) => `admexo-dismissed-mentions:${userId}`;

export function readDismissedMentions(userId: string) {
  if (typeof window === "undefined") return [] as string[];
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY(userId)) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function writeDismissedMentions(userId: string, ids: string[]) {
  window.localStorage.setItem(KEY(userId), JSON.stringify(ids.slice(-400)));
}
