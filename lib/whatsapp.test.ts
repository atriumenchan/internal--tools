import { describe, expect, it } from "vitest";
import {
  normalizeWhatsAppPhone,
  notificationText,
  overdueTaskHref,
  sanitizeTemplateParam,
  stripWhatsAppLinks,
  templateParamsFromText,
  whatsappTaskText,
} from "./whatsapp";

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
  it("joins title and body with no app link", () => {
    const text = notificationText({
      title: "New task",
      body: "Close the books",
      href: "/tasks",
      origin: "https://workspace.admexo.us",
    });
    expect(text).toContain("New task");
    expect(text).toContain("Close the books");
    expect(text).not.toContain("http");
  });
});

describe("whatsappTaskText", () => {
  it("is the task and who created it", () => {
    expect(whatsappTaskText({ title: "Close the books", byName: "Ryan Ritabrata" })).toBe(
      "Close the books\nFrom Ryan Ritabrata"
    );
    expect(stripWhatsAppLinks("Close the books\nhttps://workspace.admexo.us/spaces/1/tasks/2")).toBe("Close the books");
  });
});

describe("overdueTaskHref", () => {
  it("points at the task page", () => {
    expect(overdueTaskHref("space-1", "task-9")).toBe("/spaces/space-1/tasks/task-9");
  });
});

describe("templateParamsFromText", () => {
  it("flattens the alert into two WhatsApp template variables", () => {
    const parts = templateParamsFromText("Ryan assigned you a task\nClose the books\nhttps://app/tasks/1");
    expect(parts.heading).toBe("Ryan assigned you a task");
    expect(parts.detail).toBe("Close the books — https://app/tasks/1");
    expect(sanitizeTemplateParam("line\n\n  two")).toBe("line two");
  });
});
