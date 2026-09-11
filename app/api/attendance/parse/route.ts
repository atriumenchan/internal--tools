import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseAttendanceBuffer } from "@/lib/parse-excel";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an Excel file first." }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseAttendanceBuffer(buffer);
    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read this file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
