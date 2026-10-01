/** Photos in R2 are read back through our own route so the bucket stays private. */
export const R2_PREFIX = "r2:";

export function avatarKey(url: string | null | undefined) {
  const value = (url || "").trim();
  return value.startsWith(R2_PREFIX) ? value.slice(R2_PREFIX.length) : null;
}

export function avatarSrc(profile: { id?: string | null; avatar_url?: string | null } | null | undefined) {
  const url = (profile?.avatar_url || "").trim();
  if (!url) return undefined;
  if (url.startsWith(R2_PREFIX)) return profile?.id ? `/api/profile-image?id=${profile.id}` : undefined;
  return url;
}
