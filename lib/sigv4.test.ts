import { describe, expect, it } from "vitest";
import { encodePath, presignParts, presignUrl, signingKey } from "./sigv4";

const awsExample = {
  method: "GET" as const,
  host: "examplebucket.s3.amazonaws.com",
  canonicalUri: "/test.txt",
  region: "us-east-1",
  service: "s3",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  expiresIn: 86400,
  now: new Date("2013-05-24T00:00:00.000Z"),
};

describe("signingKey", () => {
  // AWS "derive a signing key" example.
  it("matches the AWS reference key", () => {
    expect(signingKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20150830", "us-east-1", "iam").toString("hex")).toBe(
      "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9"
    );
  });
});

describe("presignParts", () => {
  // AWS presigned-URL example for examplebucket/test.txt.
  it("builds the AWS reference canonical request", () => {
    const parts = presignParts(awsExample);
    expect(parts.canonicalRequest).toBe(
      [
        "GET",
        "/test.txt",
        "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host",
        "host:examplebucket.s3.amazonaws.com\n",
        "host",
        "UNSIGNED-PAYLOAD",
      ].join("\n")
    );
    expect(parts.canonicalHash).toBe("3bfa292879f6447bbcda7001decf97f4a54dc650c8942174ae0a9121cf58ad04");
  });
});

describe("presignUrl", () => {
  it("puts the signature last and keeps the signed params", () => {
    const url = presignUrl(awsExample);
    expect(url).toContain("X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request");
    expect(url).toContain("X-Amz-Date=20130524T000000Z");
    expect(url).toMatch(/&X-Amz-Signature=[0-9a-f]{64}$/);
  });

  it("keeps slashes in the key and encodes the rest", () => {
    expect(encodePath("abc/123-file name.png")).toBe("abc/123-file%20name.png");
  });

  it("signs extra response params too", () => {
    const parts = presignParts({
      ...awsExample,
      host: "acc.r2.cloudflarestorage.com",
      canonicalUri: "/task-files/a/b.pdf",
      region: "auto",
      extraQuery: { "response-content-disposition": 'inline; filename="b.pdf"' },
    });
    expect(parts.canonicalRequest).toContain("response-content-disposition=inline%3B%20filename%3D%22b.pdf%22");
  });
});
