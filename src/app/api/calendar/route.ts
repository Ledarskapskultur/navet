import { NextResponse } from "next/server";
import { addDays, startOfDay } from "date-fns";
import { getCalendarProvider } from "@/lib/integrations/microsoft/providers";
import { GraphAuthError } from "@/lib/integrations/microsoft/graph";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = q.get("from") ? new Date(q.get("from")!) : startOfDay(new Date());
  const to = q.get("to") ? new Date(q.get("to")!) : addDays(from, 7);
  const provider = await getCalendarProvider(await getStore());
  try {
    return NextResponse.json({ provider: provider.kind, events: await provider.listEvents(from, to, Number(q.get("tz") ?? 0)) });
  } catch (err) {
    console.error("[navet] calendar", err);
    const message = err instanceof GraphAuthError ? err.message : "Kunde inte hämta kalendern från Outlook just nu.";
    return NextResponse.json({ provider: provider.kind, events: [], error: message });
  }
}
