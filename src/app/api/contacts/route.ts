import { NextResponse } from "next/server";
import { autoSyncDue, linkedinFeatureStatus, queryContacts } from "@/lib/integrations/linkedin/sync";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;

/** LinkedIn contacts stored in Navet, searchable by name and company. Never sample data. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const store = await getStore();
  const { state, info } = await linkedinFeatureStatus(store);
  const base = { state, lastSyncAt: info.lastSyncAt, pending: info.pending, error: state === "error" || state === "needs_reauth" ? info.lastError : null };
  // Without a token, or with integrations switched off, nothing is served.
  if (state === "not_configured" || state === "locked") {
    return NextResponse.json({ ...base, lastSyncAt: null, contacts: [], matching: 0, total: 0, autoSyncDue: false });
  }
  const limit = Math.min(Math.max(Number(params.get("limit")) || 100, 1), MAX_LIMIT);
  const offset = Math.max(Number(params.get("offset")) || 0, 0);
  try {
    const result = await queryContacts(store, { q: params.get("q") ?? undefined, limit, offset });
    return NextResponse.json({ ...base, ...result, autoSyncDue: autoSyncDue(info) });
  } catch (err) {
    console.error("[navet] contacts", (err as Error).message);
    return NextResponse.json({ ...base, state: "error", contacts: [], matching: 0, total: 0, autoSyncDue: false, error: (err as Error).message || "Kunde inte läsa kontakterna." });
  }
}
