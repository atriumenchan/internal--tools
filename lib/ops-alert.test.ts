import { describe, expect, it } from "vitest";
import { opsAlertText } from "./ops-alert";

describe("opsAlertText", () => {
  it("accepts a title and a message", () => {
    expect(opsAlertText({ title: "WordPress is down", message: "Homepage returned 500" })).toEqual({
      title: "WordPress is down",
      message: "Homepage returned 500",
    });
  });

  it("accepts a single line under another field name", () => {
    expect(opsAlertText({ alert: "API gone" })?.title).toBe("API gone");
  });

  it("rejects an empty body", () => {
    expect(opsAlertText({})).toBeNull();
  });
});
