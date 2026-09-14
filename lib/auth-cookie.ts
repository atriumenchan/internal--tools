import type { NextRequest } from "next/server";

function readAccessToken(request: NextRequest) {
  const authCookies = request.cookies
    .getAll()
    .filter((cookie) => /-auth-token(?:\.\d+)?$/.test(cookie.name) && !cookie.name.includes("code-verifier"));
  if (!authCookies.length) return null;
  authCookies.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  let raw = authCookies.map((cookie) => cookie.value).join("");
  if (raw.startsWith("base64-")) {
    try {
      raw = atob(raw.slice(7));
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(raw) as { access_token?: string } | string[];
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.access_token === "string") {
      return parsed.access_token;
    }
    if (Array.isArray(parsed) && typeof parsed[0] === "string") return parsed[0];
  } catch {
    if (raw.split(".").length === 3) return raw;
  }
  return null;
}

export function hasFreshSession(request: NextRequest) {
  const token = readAccessToken(request);
  if (!token) return false;
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof json.exp === "number" && json.exp * 1000 > Date.now() + 90_000;
  } catch {
    return false;
  }
}
