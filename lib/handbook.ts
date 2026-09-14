export const HANDBOOK_PDF = "/handbook/ADMEXO-Employee-Intern-Handbook-v2.0.pdf";
export const DEFAULT_HANDBOOK_VERSION = "2.0";

export function handbookIsCurrent(
  profileVersion: string | null | undefined,
  requiredVersion: string | null | undefined
) {
  const required = (requiredVersion || DEFAULT_HANDBOOK_VERSION).trim();
  const signed = (profileVersion || "").trim();
  return Boolean(signed) && signed === required;
}
