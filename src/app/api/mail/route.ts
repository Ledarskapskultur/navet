import { NextResponse } from "next/server";
import { getMailProvider } from "@/lib/integrations/microsoft/providers";
import { GraphAuthError } from "@/lib/integrations/microsoft/graph";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = await getMailProvider(await getStore());
  try {
    return NextResponse.json({ provider: provider.kind, state: provider.state, mails: await provider.listFlagged() });
  } catch (err) {
    console.error("[navet] mail", (err as Error).message);
    return NextResponse.json({ provider: provider.kind, state: err instanceof GraphAuthError ? "needs_reauth" : "error", mails: [], error: (err as Error).message || "Kunde inte hämta mejl från Outlook just nu." });
  }
}
