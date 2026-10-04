import { NextResponse } from "next/server";
import { deleteMsConnection } from "@/lib/integrations/microsoft/connection";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function POST() {
  await deleteMsConnection(await getStore());
  return NextResponse.json({ ok: true });
}
