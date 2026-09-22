/** Personal last-week window from stored attendance dates (YYYY-MM-DD). */

export function addDaysKey(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function mondayOf(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = date.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

export function sundayOf(key: string) {
  return addDaysKey(mondayOf(key), 6);
}

/** Latest Mon–Sun that has at least one punch in `keys`. */
export function lastWeekBounds(keys: string[]) {
  const sorted = [...new Set(keys.filter(Boolean))].sort();
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;
  const start = mondayOf(latest);
  const end = sundayOf(latest);
  return { start, end };
}

/** Oldest date within `lookbackDays` of the newest punch (covers a two-week Excel). */
export function latestUploadRange(keys: string[], lookbackDays = 16) {
  const sorted = [...new Set(keys.filter(Boolean))].sort();
  if (!sorted.length) return null;
  const end = sorted[sorted.length - 1];
  const floor = addDaysKey(end, -lookbackDays);
  const start = sorted.find((key) => key >= floor) ?? end;
  return { start, end };
}
