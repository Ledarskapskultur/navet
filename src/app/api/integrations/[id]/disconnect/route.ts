import { NextResponse } from "next/server";
import { disableMsFeature } from "@/lib/integrations/microsoft/connection";
import { integrationStatuses } from "@/lib/integrations/status";
import { INTEGRATION_IDS, type IntegrationId } from "@/lib/integrations/types";
import { appUrl } from "@/lib/server/env";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** "Koppla från": Navet stops using the account. The stored tokens go when nothing uses them. */
export async function POST(req: Request, ctx: RouteContext<"/api/integrations/[id]/disconnect">) {
  const { id } = await ctx.params;
  if (!INTEGRATION_IDS.includes(id as IntegrationId)) return NextResponse.json({ error: "Okänd integration" }, { status: 404 });
  const store = await getStore();
  if (id === "outlook_mail") await disableMsFeature(store, "mail");
  else if (id === "outlook_calendar") await disableMsFeature(store, "calendar");
  else return NextResponse.json({ error: "LinkedIn är inte anslutet." }, { status: 400 });
  return NextResponse.json({ integrations: await integrationStatuses(store, appUrl(req)) });
}
