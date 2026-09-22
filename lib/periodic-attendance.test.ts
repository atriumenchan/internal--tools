import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parsePeriodicExport, rangeLabel } from "./periodic-attendance";

describe("parsePeriodicExport", () => {
  it("reads the Periodic Datewise reference file by employee code and date bounds", () => {
    const buf = readFileSync("C:/Users/ADMEXO/Downloads/reference.xls");
    const report = parsePeriodicExport(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(report.company).toBe("ADMEXO");
    expect(report.startDate).toBe("2026-09-06");
    expect(report.endDate).toBe("2026-09-20");
    expect(report.records.length).toBeGreaterThan(20);
    const kartik = report.records.filter((row) => row.empCode.replace(/^0+/, "") === "4");
    expect(kartik[0]?.name).toMatch(/Kartik/i);
    expect(rangeLabel(report.startDate, report.endDate)).toMatch(/6 Sept? 2026/);
    expect(rangeLabel(report.startDate, report.endDate)).toMatch(/20 Sept? 2026/);
  });
});
