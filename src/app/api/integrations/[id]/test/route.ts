import { NextResponse } from "next/server";
import { testIntegration } from "@/lib/integrations/test";
import { integrationStatuses } from "@/lib/integrations/status";
import { INTEGRATION_IDS, type IntegrationId } from "@/lib/integrations/types";
import { appUrl } from "@/lib/server/env";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** "Testa anslutningen" / "Försök igen": makes a real call to the provider and reports how it went. */
export async function POST(req: Request, ctx: RouteContext<"/api/integrations/[id]/test">) {
  const { id } = await ctx.params;
  if (!INTEGRATION_IDS.includes(id as IntegrationId)) return NextResponse.json({ error: "Okänd integration" }, { status: 404 });
  const store = await getStore();
  const result = await testIntegration(store, id as IntegrationId);
  return NextResponse.json({ ...result, integrations: await integrationStatuses(store, appUrl(req)) });
}
