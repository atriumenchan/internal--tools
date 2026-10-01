import { createHash, createHmac } from "crypto";

export type PresignInput = {
  method: "GET" | "PUT" | "DELETE";
  host: string;
  /** Already-encoded path, starting with a slash. */
  canonicalUri: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresIn: number;
  /** Signing time. Defaults to now. */
  now?: Date;
  extraQuery?: Record<string, string>;
};

export function rfc3986(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function encodePath(segments: string) {
  return segments.split("/").map(rfc3986).join("/");
}

export function amzStamp(now: Date) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function signingKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
  const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value, "utf8").digest();
  return hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), "aws4_request");
}

/** Query-string signed URL, AWS Signature Version 4, unsigned payload. */
export function presignParts(input: PresignInput) {
  const stamp = amzStamp(input.now ?? new Date());
  const scope = `${stamp.slice(0, 8)}/${input.region}/${input.service}/aws4_request`;

  const params: Record<string, string> = {
    ...(input.extraQuery ?? {}),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(input.expiresIn),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((name) => `${rfc3986(name)}=${rfc3986(params[name])}`)
    .join("&");

  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    canonicalQuery,
    `host:${input.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const canonicalHash = createHash("sha256").update(canonicalRequest, "utf8").digest("hex");
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, canonicalHash].join("\n");
  const key = signingKey(input.secretAccessKey, stamp.slice(0, 8), input.region, input.service);
  const signature = createHmac("sha256", key).update(stringToSign, "utf8").digest("hex");

  return {
    canonicalRequest,
    canonicalHash,
    stringToSign,
    signature,
    url: `https://${input.host}${input.canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
  };
}

export function presignUrl(input: PresignInput) {
  return presignParts(input).url;
}
