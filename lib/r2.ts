import "server-only";
import { encodePath, presignUrl } from "@/lib/sigv4";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

/** Cloudflare R2 holds task files. Null when the keys are not on this deployment yet. */
export function r2Config(): R2Config | null {
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = (process.env.R2_BUCKET || "task-files").trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/** Presigned S3-style URL. R2 accepts these for GET, PUT, and DELETE. */
export function presignR2(
  config: R2Config,
  method: "GET" | "PUT" | "DELETE",
  key: string,
  expiresIn = 300,
  extraQuery: Record<string, string> = {}
) {
  return presignUrl({
    method,
    host: `${config.accountId}.r2.cloudflarestorage.com`,
    canonicalUri: `/${encodePath(`${config.bucket}/${key}`)}`,
    region: "auto",
    service: "s3",
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresIn,
    extraQuery,
  });
}

export async function deleteFromR2(config: R2Config, key: string) {
  const res = await fetch(presignR2(config, "DELETE", key, 120), { method: "DELETE" });
  return res.ok || res.status === 404;
}

/** A filename safe for a Content-Disposition header. */
export function asciiFileName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}

export function storageKey(taskId: string, fileName: string) {
  return `${taskId}/${Date.now()}-${fileName.replace(/[^\w.-]+/g, "_").slice(0, 120)}`;
}
