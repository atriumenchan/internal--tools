import { describe, expect, it } from "vitest";
import { expectedHours } from "./attendance";
import { hoursLabel } from "./datetime";

describe("expectedHours", () => {
  it("is 8:30 for each present day", () => {
    expect(hoursLabel(expectedHours(5))).toBe("42:30");
    expect(hoursLabel(expectedHours(6))).toBe("51:00");
    expect(hoursLabel(expectedHours(0.5))).toBe("4:15");
    expect(expectedHours(0)).toBe(0);
  });
});
