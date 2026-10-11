import { NextResponse } from "next/server";
import { syncLinkedInContacts } from "@/lib/integrations/linkedin/sync";
import { integrationStatuses } from "@/lib/integrations/status";
import { appUrl, integrationsUnlocked } from "@/lib/server/env";
import { readJson } from "@/lib/server/api";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
// A long contact list is fetched page by page. The fetch stops by itself well before this limit.
export const maxDuration = 60;

/**
 * "Hämta om": fetches the integration's data again and stores it in Navet. Only reads from
 * the provider. With { auto: true } nothing happens unless a day has passed since the last attempt.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/integrations/[id]/sync">) {
  const { id } = await ctx.params;
  if (id !== "linkedin") return NextResponse.json({ error: "Den här integrationen har inget att hämta om." }, { status: 404 });
  if (!integrationsUnlocked()) return NextResponse.json({ error: "Integrationer är avstängda tills Navet har ett lösenord (APP_PASSWORD)." }, { status: 403 });
  const { auto } = await readJson<{ auto?: boolean }>(req);
  const store = await getStore();
  const result = await syncLinkedInContacts(store, auto === true ? "auto" : "manual");
  if (!result.ok) console.error("[navet] linkedin", result.message);
  return NextResponse.json({ ...result, integrations: await integrationStatuses(store, appUrl(req)) });
}
