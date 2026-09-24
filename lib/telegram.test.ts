import { describe, expect, it } from "vitest";
import { taskAssignedText } from "./telegram";

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
