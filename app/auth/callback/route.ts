import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/spaces";
  const error = searchParams.get("error_description") ?? searchParams.get("error");

  if (error) {
    const login = new URL("/login", origin);
    login.searchParams.set("error", error);
    return NextResponse.redirect(login);
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(new URL(next, origin));
    }
    const login = new URL("/login", origin);
    login.searchParams.set("error", exchangeError.message);
    return NextResponse.redirect(login);
  }

  return NextResponse.redirect(new URL("/login", origin));
}
