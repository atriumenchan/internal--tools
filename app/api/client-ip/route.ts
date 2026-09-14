import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || null;
  return NextResponse.json({ ip });
}
