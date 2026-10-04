import { NextResponse } from "next/server";
import { formToRequest, InboundError, originAllowed, rateLimited, type InboundForm } from "@/lib/server/inbound";
import { NavetService } from "@/lib/server/service";
import { OWNER_ID } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Public endpoint for booking forms on landing pages (no login needed, protected by
 * honeypot, rate limit and optional origin allow-list). Accepts JSON (fetch) or a
 * plain HTML form post.
 */
function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  if (!originAllowed(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: cors(origin) });
}

export async function POST(req: Request, ctx: RouteContext<"/api/inbound/[source]">) {
  const { source } = await ctx.params;
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (!originAllowed(origin)) return NextResponse.json({ error: "Otillåten webbplats" }, { status: 403, headers });

  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
  let raw: InboundForm & { redirect?: string };
  try {
    raw = isJson ? await req.json() : (Object.fromEntries(await req.formData()) as Record<string, string>);
  } catch {
    return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400, headers });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "okänd";
  if (rateLimited(ip)) return NextResponse.json({ error: "För många förfrågningar, försök igen senare" }, { status: 429, headers });

  try {
    const input = formToRequest(source, raw);
    const svc = await NavetService.create({ mode: "personal", userId: OWNER_ID, session: null });
    await svc.createItem(input);
  } catch (err) {
    // Spam gets a fake success so bots learn nothing.
    if (err instanceof InboundError && err.status === 422) return NextResponse.json({ ok: true }, { headers });
    if (err instanceof InboundError) return NextResponse.json({ error: err.message }, { status: err.status, headers });
    console.error("[navet] inbound", err);
    return NextResponse.json({ error: "Kunde inte ta emot förfrågan" }, { status: 500, headers });
  }

  // Plain HTML form without JavaScript: send the visitor back to a thank-you page.
  if (!isJson) {
    const back = raw.redirect && /^https?:\/\//.test(raw.redirect) ? raw.redirect : req.headers.get("referer");
    if (back) return NextResponse.redirect(back, 303);
    return new NextResponse("<p>Tack! Vi återkommer så snart vi kan.</p>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return NextResponse.json({ ok: true }, { headers });
}
