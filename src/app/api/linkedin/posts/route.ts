import { NextResponse } from "next/server";
import { addManualPost } from "@/lib/integrations/linkedin/engagement";
import { readJson } from "@/lib/server/api";
import { apifyConfigured, integrationsUnlocked } from "@/lib/server/env";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Adds one of the owner's posts from a pasted link, for when LinkedIn's own list has not caught up. */
export async function POST(req: Request) {
  if (!integrationsUnlocked()) return NextResponse.json({ error: "Integrationer är avstängda tills Navet har ett lösenord (APP_PASSWORD)." }, { status: 403 });
  if (!apifyConfigured()) return NextResponse.json({ error: "APIFY_TOKEN saknas på servern." }, { status: 400 });
  const { url } = await readJson<{ url?: string }>(req);
  const post = typeof url === "string" ? await addManualPost(await getStore(), url) : null;
  if (!post) return NextResponse.json({ error: "Det där ser inte ut som en länk till ett LinkedIn-inlägg. Kopiera länken via de tre prickarna på inlägget, Kopiera länk till inlägg." }, { status: 400 });
  return NextResponse.json({ post });
}
