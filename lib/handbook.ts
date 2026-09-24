import { isAdminUser } from "@/lib/admin";

export const HANDBOOK_PDF = "/handbook/ADMEXO-Employee-Intern-Handbook-v2.0.pdf";
export const HANDBOOK_FILE = "/api/handbook/file";
export const DEFAULT_HANDBOOK_VERSION = "2.0";

export function handbookFileUrl(version?: string | null, download = false) {
  const params = new URLSearchParams();
  if (version) params.set("v", version);
  if (download) params.set("download", "1");
  const q = params.toString();
  return q ? `${HANDBOOK_FILE}?${q}` : HANDBOOK_FILE;
}

export function nextHandbookVersion(current: string | null | undefined) {
  const text = (current || DEFAULT_HANDBOOK_VERSION).trim();
  const match = /^(\d+)\.(\d+)/.exec(text);
  if (!match) return `${text}.1`;
  return `${match[1]}.${Number(match[2]) + 1}`;
}

export function handbookIsCurrent(
  profileVersion: string | null | undefined,
  requiredVersion: string | null | undefined
) {
  const required = (requiredVersion || DEFAULT_HANDBOOK_VERSION).trim();
  const signed = (profileVersion || "").trim();
  return Boolean(signed) && signed === required;
}

/** Staff must sign. Ryan Ritabrata skips the handbook gate. */
export function mustSignHandbook(input: {
  role?: string | null;
  email?: string | null;
  handbookVersion?: string | null;
  requiredVersion?: string | null;
}) {
  if (isAdminUser({ role: input.role, email: input.email })) return false;
  return !handbookIsCurrent(input.handbookVersion, input.requiredVersion);
}
