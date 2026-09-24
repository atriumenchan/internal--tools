import { describe, expect, it } from "vitest";
import { normalizeTelegramId, taskAssignedText } from "./telegram";

describe("normalizeTelegramId", () => {
  it("keeps numeric user ids", () => {
    expect(normalizeTelegramId("5684211555")).toBe("5684211555");
    expect(normalizeTelegramId(" -1004298300371 ")).toBe("-1004298300371");
    expect(normalizeTelegramId("@Admexo_bot")).toBe(null);
  });
});

describe("taskAssignedText", () => {
  it("names the person and the task", () => {
    const text = taskAssignedText({
      title: "Close the books",
      assigneeName: "Priya",
      byName: "Ryan Ritabrata",
      spaceName: "Finance",
      due: "2026-09-24",
      url: "https://workspace.admexo.us/spaces/1/tasks/2",
    });
    expect(text).toContain("Priya has a new task");
    expect(text).toContain("Close the books");
    expect(text).toContain("Finance");
  });
});
