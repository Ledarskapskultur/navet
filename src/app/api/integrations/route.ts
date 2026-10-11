import { NextResponse } from "next/server";
import { integrationStatuses } from "@/lib/integrations/status";
import { appUrl } from "@/lib/server/env";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Status for every integration: state, account, permissions, last sync and last error. */
export async function GET(req: Request) {
  return NextResponse.json({ integrations: await integrationStatuses(await getStore(), appUrl(req)) });
}
