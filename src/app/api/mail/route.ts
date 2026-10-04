import { NextResponse } from "next/server";
import { getMailProvider } from "@/lib/integrations/microsoft/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = getMailProvider();
  return NextResponse.json({ provider: provider.kind, mails: await provider.listFlagged() });
}
