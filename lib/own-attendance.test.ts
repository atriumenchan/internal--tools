import { describe, expect, it } from "vitest";
import { lastWeekBounds, latestUploadRange, mondayOf } from "./own-attendance";

describe("own attendance windows", () => {
  it("last week is Mon–Sun of the latest punch", () => {
    expect(mondayOf("2026-09-20")).toBe("2026-09-14");
    expect(lastWeekBounds(["2026-09-06", "2026-09-18", "2026-09-20"])).toEqual({
      start: "2026-09-14",
      end: "2026-09-20",
    });
  });

  it("latest upload range keeps the last two weeks and drops an older month", () => {
    expect(latestUploadRange(["2026-09-06", "2026-09-07", "2026-09-11", "2026-09-20"])).toEqual({
      start: "2026-09-06",
      end: "2026-09-20",
    });
    expect(latestUploadRange(["2026-08-10", "2026-09-14", "2026-09-18"])).toEqual({
      start: "2026-09-14",
      end: "2026-09-18",
    });
  });
});
