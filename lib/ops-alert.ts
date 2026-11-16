export function opsAlertText(body: Record<string, unknown>) {
  const title = String(body.title ?? body.subject ?? body.alert ?? "")
    .trim()
    .slice(0, 140);
  const message = String(body.message ?? body.body ?? body.text ?? "")
    .trim()
    .slice(0, 500);
  if (!title && !message) return null;
  return {
    title: title || message.slice(0, 140),
    message: title && message && message !== title ? message : "",
  };
}
