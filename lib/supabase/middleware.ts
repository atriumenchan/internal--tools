import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasFreshSession } from "@/lib/auth-cookie";

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url.includes("YOUR_PROJECT")) {
    return NextResponse.next({ request });
  }

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/sign") ||
    path.startsWith("/setup") ||
    path.startsWith("/auth") ||
    path.startsWith("/api") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico";

  const fresh = hasFreshSession(request);

  if (fresh && isPublic && path.startsWith("/login")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/spaces";
    return NextResponse.redirect(redirect);
  }

  if (fresh && !isPublic) {
    return NextResponse.next({ request });
  }

  if (!fresh && !isPublic && !request.cookies.getAll().some((c) => c.name.includes("auth-token"))) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  if (user && path.startsWith("/login")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/spaces";
    return NextResponse.redirect(redirect);
  }

  return supabaseResponse;
}
