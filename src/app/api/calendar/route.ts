import { NextResponse } from "next/server";
import { addDays, startOfDay } from "date-fns";
import { getCalendarProvider } from "@/lib/integrations/microsoft/providers";
import { GraphAuthError } from "@/lib/integrations/microsoft/graph";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const MAX_RANGE_DAYS = 62;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const parsed = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
  const from = parsed(q.get("from")) ?? startOfDay(new Date());
  let to = parsed(q.get("to")) ?? addDays(from, 7);
  if (to <= from || to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86400_000) to = addDays(from, 7);
  const provider = await getCalendarProvider(await getStore());
  try {
    return NextResponse.json({
      provider: provider.kind,
      state: provider.state,
      events: await provider.listEvents(from, to, Number(q.get("tz") ?? 0) || 0),
    });
  } catch (err) {
    console.error("[navet] calendar", (err as Error).message);
    return NextResponse.json({ provider: provider.kind, state: err instanceof GraphAuthError ? "needs_reauth" : "error", events: [], error: (err as Error).message || "Kunde inte hämta kalendern från Outlook just nu." });
  }
}
