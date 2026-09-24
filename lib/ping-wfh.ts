export function pingWfhRequest(payload: { byName: string; workDate: string }) {
  void fetch("/api/telegram/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "wfh_request", ...payload }),
  }).catch(() => {});
}
