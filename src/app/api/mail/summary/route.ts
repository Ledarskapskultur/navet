import { NextResponse } from "next/server";
import { getMailProvider } from "@/lib/integrations/microsoft/providers";
import { GraphAuthError } from "@/lib/integrations/microsoft/graph";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const EMPTY = { unreadCount: null, flaggedCount: null, flaggedMore: false, important: [], flagged: [], latest: [] };

/** The mailbox at a glance for the start page: counts plus important, flagged and latest mail. */
export async function GET() {
  const provider = await getMailProvider(await getStore());
  try {
    return NextResponse.json({ provider: provider.kind, state: provider.state, summary: await provider.summary() });
  } catch (err) {
    console.error("[navet] mail summary", (err as Error).message);
    return NextResponse.json({ provider: provider.kind, state: err instanceof GraphAuthError ? "needs_reauth" : "error", summary: EMPTY, error: (err as Error).message || "Kunde inte hämta mejl från Outlook just nu." });
  }
}
