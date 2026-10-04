import { NextResponse, type NextRequest } from "next/server";
import { LOCK_COOKIE, lockSecret, lockToken, safeEqual } from "@/lib/app-lock";

/** When APP_PASSWORD is set, everything except the login page requires the unlock cookie. */
export async function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const cookie = req.cookies.get(LOCK_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await lockToken(password, lockSecret()))) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Navet är låst. Logga in igen.", code: "locked" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/logga-in";
  url.search = "";
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page/route, static files, icons, manifest and service worker.
  matcher: ["/((?!logga-in|api/auth/unlock|api/inbound/|navet-form.js|_next/|icons/|manifest.webmanifest|sw.js|favicon).*)"],
};
