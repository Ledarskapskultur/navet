import { NextResponse } from "next/server";
import { revokeToken } from "@/lib/integrations/google/oauth";
import { clearSession, readSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await readSession();
  const revoke = new URL(req.url).searchParams.get("revoke") === "1";
  if (session && revoke) await revokeToken(session.google.refreshToken ?? session.google.accessToken);
  await clearSession();
  return NextResponse.json({ ok: true });
}
