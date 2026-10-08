import { describe, expect, it } from "vitest";
import { isReportsSpace, reportKindFromTitle, reportPeriodLabel, reportTitle } from "./reports";

describe("isReportsSpace", () => {
  it("matches the Reports board by name", () => {
    expect(isReportsSpace({ name: "Reports" })).toBe(true);
    expect(isReportsSpace({ name: "Ops" })).toBe(false);
  });
});

describe("reportTitle", () => {
  it("names a weekly report with the IST week", () => {
    expect(reportPeriodLabel("weekly", "2026-10-06")).toBe("5 Oct – 11 Oct");
    expect(reportTitle("weekly", "Kartik Dhyani", "2026-10-06")).toBe("Weekly report · Kartik Dhyani · 5 Oct – 11 Oct");
  });

  it("names a monthly report with the month", () => {
    expect(reportTitle("monthly", "Kartik Dhyani", "2026-10-06")).toBe("Monthly report · Kartik Dhyani · October 2026");
  });

  it("reads weekly vs monthly back from the title", () => {
    expect(reportKindFromTitle("Weekly report · Kartik Dhyani · 5 Oct – 11 Oct")).toBe("weekly");
    expect(reportKindFromTitle("Monthly report · Kartik Dhyani · October 2026")).toBe("monthly");
    expect(reportKindFromTitle("Fix login")).toBe(null);
  });
});
