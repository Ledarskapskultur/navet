import { NextResponse } from "next/server";
import { deleteMsConnection } from "@/lib/integrations/microsoft/connection";
import { integrationsUnlocked } from "@/lib/server/env";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Removes the whole Microsoft connection (mail and calendar) and its stored tokens. */
export async function POST() {
  if (!integrationsUnlocked()) return NextResponse.json({ error: "Integrationer är avstängda tills Navet har ett lösenord (APP_PASSWORD)." }, { status: 403 });
  await deleteMsConnection(await getStore());
  return NextResponse.json({ ok: true });
}
