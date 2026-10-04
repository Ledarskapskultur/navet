import { NextResponse } from "next/server";
import { getMailProvider } from "@/lib/integrations/microsoft/providers";
import { GraphAuthError } from "@/lib/integrations/microsoft/graph";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = await getMailProvider(await getStore());
  try {
    return NextResponse.json({ provider: provider.kind, mails: await provider.listFlagged() });
  } catch (err) {
    console.error("[navet] mail", err);
    const message = err instanceof GraphAuthError ? err.message : "Kunde inte hämta mail från Outlook just nu.";
    return NextResponse.json({ provider: provider.kind, mails: [], error: message });
  }
}
