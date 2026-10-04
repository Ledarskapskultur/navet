import { NextResponse } from "next/server";
import { LOCK_COOKIE } from "@/lib/app-lock";

export const dynamic = "force-dynamic";

export function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(LOCK_COOKIE);
  return res;
}
