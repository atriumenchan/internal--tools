import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseAttendanceBuffer } from "@/lib/parse-excel";
import { rangeLabel } from "@/lib/periodic-attendance";
import { buildPeriodicWorkbook } from "@/lib/periodic-report";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an Excel file first." }, { status: 400 });
  }

  try {
    const parsed = parseAttendanceBuffer(await file.arrayBuffer());
    if (parsed.kind !== "periodic") {
      return NextResponse.json({ error: "This download is for the Periodic Datewise attendance export." }, { status: 400 });
    }
    const label = rangeLabel(parsed.report.startDate, parsed.report.endDate);
    const buffer = await buildPeriodicWorkbook(parsed.report, label);
    const safe = label.replace(/[^\w.–-]+/g, "_");
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="attendance-report-${safe}.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not build the report" }, { status: 400 });
  }
}
