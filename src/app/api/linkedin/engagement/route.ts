import { NextResponse } from "next/server";
import { engagementOverview } from "@/lib/integrations/linkedin/engagement";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const DAYS = [14, 30, 90];

/** Statistics for the owner's LinkedIn posts and the people who engaged with them. Never sample data. */
export async function GET(req: Request) {
  const asked = Number(new URL(req.url).searchParams.get("days"));
  try {
    return NextResponse.json(await engagementOverview(await getStore(), DAYS.includes(asked) ? asked : 30));
  } catch (err) {
    console.error("[navet] linkedin engagement", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message || "Kunde inte läsa statistiken." }, { status: 500 });
  }
}
