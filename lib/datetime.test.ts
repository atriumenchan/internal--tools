import { describe, expect, it } from "vitest";
import { compareDueSoon, dueOffsetDays, dueWhenLabel } from "./datetime";

describe("dueWhenLabel", () => {
  it("names today, tomorrow, and overdue", () => {
    expect(dueWhenLabel("2026-09-24", "open", "2026-09-24")).toBe("Due today");
    expect(dueWhenLabel("2026-09-25", "open", "2026-09-24")).toBe("Due tomorrow");
    expect(dueWhenLabel("2026-09-23", "open", "2026-09-24")).toBe("Overdue · yesterday");
    expect(dueWhenLabel("2026-09-21", "open", "2026-09-24")).toBe("Overdue · 3 days");
    expect(dueWhenLabel(null, "open", "2026-09-24")).toBe(null);
  });
});

describe("compareDueSoon", () => {
  it("puts the nearest due date first and undated last", () => {
    const rows = [
      { due_date: null, status: "open" },
      { due_date: "2026-09-28", status: "open" },
      { due_date: "2026-09-24", status: "open" },
      { due_date: "2026-09-20", status: "open" },
    ];
    rows.sort(compareDueSoon);
    expect(rows.map((r) => r.due_date)).toEqual(["2026-09-20", "2026-09-24", "2026-09-28", null]);
  });
});

describe("dueOffsetDays", () => {
  it("counts days from today", () => {
    expect(dueOffsetDays("2026-09-24", "2026-09-24")).toBe(0);
    expect(dueOffsetDays("2026-09-26", "2026-09-24")).toBe(2);
  });
});
