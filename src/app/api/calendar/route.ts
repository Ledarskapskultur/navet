import { NextResponse } from "next/server";
import { addDays, startOfDay } from "date-fns";
import { getCalendarProvider } from "@/lib/integrations/microsoft/providers";
import { outlookConfigured } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = q.get("from") ? new Date(q.get("from")!) : startOfDay(new Date());
  const to = q.get("to") ? new Date(q.get("to")!) : addDays(from, 7);
  const provider = getCalendarProvider();
  return NextResponse.json({
    provider: provider.kind,
    outlookConfigured: outlookConfigured(),
    events: await provider.listEvents(from, to, Number(q.get("tz") ?? 0)),
  });
}
