import { describe, expect, it } from "vitest";
import { normalizeWhatsAppPhone, notificationText } from "./whatsapp";

describe("normalizeWhatsAppPhone", () => {
  it("turns Indian mobiles into 91 plus ten digits", () => {
    expect(normalizeWhatsAppPhone("6307276542")).toBe("916307276542");
    expect(normalizeWhatsAppPhone("+91 63072 76542")).toBe("916307276542");
    expect(normalizeWhatsAppPhone("916307276542")).toBe("916307276542");
  });

  it("rejects junk", () => {
    expect(normalizeWhatsAppPhone("")).toBe(null);
    expect(normalizeWhatsAppPhone("123")).toBe(null);
  });
});

describe("notificationText", () => {
  it("joins title, body, and an app link", () => {
    const text = notificationText({
      title: "New task",
      body: "Close the books",
      href: "/tasks",
      origin: "https://workspace.admexo.us",
    });
    expect(text).toContain("New task");
    expect(text).toContain("Close the books");
    expect(text).toContain("https://workspace.admexo.us/tasks");
  });
});
