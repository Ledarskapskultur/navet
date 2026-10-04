import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/app-lock";
import { interpret, savedSpeech } from "@/lib/assistant/rules";
import { captureToItem } from "@/lib/capture";
import { parseCapture } from "@/lib/parser";
import { readJson } from "@/lib/server/api";
import { env, userNow } from "@/lib/server/env";
import { NavetService } from "@/lib/server/service";
import { OWNER_ID } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Voice API for Tasker and other automations – works while the phone is locked, since
 * Navet itself never has to open.
 *
 *   POST /api/assistant
 *   Authorization: Bearer <NAVET_API_TOKEN>
 *   { "text": "Vad har jag idag?" }
 *
 * Answers questions, runs simple commands, and saves everything else to the inbox.
 * Response: { "speech": "…", "kind": "answer" | "saved" | … } – read speech aloud.
 *
 * For Tasker the simplest form is a plain-text body (no JSON escaping needed) and
 * `?format=text`, which returns only the sentence to read aloud.
 */
export async function POST(req: Request) {
  const res = await handle(req);
  if (new URL(req.url).searchParams.get("format") !== "text") return res;
  const body = (await res.json()) as { speech?: string; error?: string };
  return new NextResponse(body.speech ?? body.error ?? "", {
    status: res.status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function handle(req: Request): Promise<NextResponse> {
  if (!env.apiToken) {
    return NextResponse.json({ error: "Röst-API:t är avstängt. Sätt NAVET_API_TOKEN." }, { status: 404 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !safeEqual(token, env.apiToken)) {
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "Fel nyckel", speech: "Navet känner inte igen nyckeln." }, { status: 401 });
  }

  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
  const said = (isJson ? (await readJson<{ text?: string }>(req)).text : await req.text())?.trim().slice(0, 1000);
  if (!said) return NextResponse.json({ kind: "empty", speech: "Jag hörde inget. Försök igen." });

  try {
    const svc = await NavetService.create({ mode: "personal", userId: OWNER_ID, session: null });
    const [items, projects] = await Promise.all([svc.listItems(), svc.listProjects()]);
    const now = userNow();
    const reply = interpret(said, { items, projects, now });

    if (!reply) {
      const parsed = parseCapture(said, projects, now);
      const created = await svc.createItem(captureToItem(parsed, { source: "voice" }));
      return NextResponse.json({ kind: "saved", speech: savedSpeech(created, now), item: created });
    }
    if (reply.kind === "complete") {
      await svc.updateItem(reply.item.id, { status: "done" });
      return NextResponse.json({ kind: "completed", speech: reply.speech });
    }
    if (reply.kind === "navigate") {
      return NextResponse.json({ kind: "navigate", speech: "Lås upp telefonen och öppna Navet för att se det.", href: reply.href });
    }
    return NextResponse.json({
      kind: reply.kind,
      speech: reply.speech,
      items: "items" in reply ? reply.items.map((i) => ({ id: i.id, title: i.title, dueDate: i.dueDate })) : [],
    });
  } catch (err) {
    console.error("[navet] assistant", err);
    return NextResponse.json({ error: "Fel", speech: "Något gick fel i Navet. Försök igen om en stund." }, { status: 500 });
  }
}
