import { NextResponse } from "next/server";
import { LOCK_COOKIE, LOCK_MAX_AGE, lockSecret, lockToken, safeEqual } from "@/lib/app-lock";
import { readJson } from "@/lib/server/api";
import { env, secureCookies } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!env.appPassword) return NextResponse.json({ ok: true });
  const { password } = await readJson<{ password?: string }>(req);
  if (!password || !safeEqual(password, env.appPassword)) {
    // Small delay makes guessing slower.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Fel lösenord" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCK_COOKIE, await lockToken(env.appPassword, lockSecret()), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: LOCK_MAX_AGE,
  });
  return res;
}
