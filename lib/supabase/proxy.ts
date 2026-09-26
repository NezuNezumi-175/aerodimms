import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const loginUrl = new URL("/login", request.url);

  if (!url || !key) {
    if (request.nextUrl.pathname === "/login") return NextResponse.next({ request });
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let user = null;
  try {
    // Proxy performs an optimistic route check from the cookie session so a
    // page navigation does not depend on reaching Auth while offline.
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user ?? null;
  } catch {
    user = null;
  }
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!user && !isLoginPage) {
    return NextResponse.redirect(loginUrl);
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}
