import "server-only";
import * as XLSX from "xlsx";
import { parseWorkbook, type ParsedSheet } from "@/lib/excel";
import {
  isMonthPerformanceGrid,
  parseMonthPerformanceMatrix,
  type MonthPerformanceReport,
} from "@/lib/month-performance";

function cells(row: unknown[] | undefined): string[] {
  return (row ?? []).map((c) => String(c ?? "").replace(/\s+/g, " ").trim());
}

export type ParsedAttendanceFile =
  | { kind: "month-performance"; report: MonthPerformanceReport }
  | { kind: "sheet"; sheet: ParsedSheet };

export function parseAttendanceBuffer(buffer: ArrayBuffer): ParsedAttendanceFile {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false }).map(cells);
  if (isMonthPerformanceGrid(matrix)) {
    return { kind: "month-performance", report: parseMonthPerformanceMatrix(matrix) };
  }
  return { kind: "sheet", sheet: parseWorkbook(buffer) };
}
