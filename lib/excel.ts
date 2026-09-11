import * as XLSX from "xlsx";
import { suggestMapping, type ParsedSheet } from "@/lib/excel-rows";

export type {
  ColumnKey,
  ColumnMapping,
  ParsedSheet,
  RawPunch,
  RawDayRow,
} from "@/lib/excel-rows";
export {
  extractDailyRows,
  extractPunches,
  excelSerialToDate,
  suggestMapping,
} from "@/lib/excel-rows";

export function parseWorkbook(buffer: ArrayBuffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });
  if (!rows.length) throw new Error("The first sheet is empty.");
  const headers = Object.keys(rows[0] ?? {});
  const suggested = suggestMapping(headers);
  const mode: "punches" | "daily" =
    suggested.punch_in || suggested.punch_out ? "daily" : "punches";
  return { headers, rows, suggested, mode };
}

export function downloadSampleWorkbook() {
  const rows = [
    {
      "Emp Code": "A001",
      Name: "Riya Shah",
      Date: "2026-09-01",
      Time: "09:52:00",
    },
    {
      "Emp Code": "A001",
      Name: "Riya Shah",
      Date: "2026-09-01",
      Time: "19:08:00",
    },
    {
      "Emp Code": "A002",
      Name: "Arjun Mehta",
      Date: "2026-09-01",
      Time: "10:21:00",
    },
    {
      "Emp Code": "A002",
      Name: "Arjun Mehta",
      Date: "2026-09-01",
      Time: "18:44:00",
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Punches");
  XLSX.writeFile(workbook, "sample-attendance.xlsx");
}

export function exportSummariesWorkbook(
  filename: string,
  rows: Array<Record<string, string | number>>
) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Monthly");
  XLSX.writeFile(workbook, filename);
}
