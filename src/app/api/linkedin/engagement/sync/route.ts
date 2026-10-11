import { NextResponse } from "next/server";
import { syncEngagement } from "@/lib/integrations/linkedin/engagement";
import { readJson } from "@/lib/server/api";
import { integrationsUnlocked } from "@/lib/server/env";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
// Each post takes up to a couple of minutes at Apify. The run stops starting new posts well
// before this limit and reports what is left, so the browser can call again.
export const maxDuration = 300;

/**
 * Fetches statistics for the recent posts, or for one post with { postId }. Only reads.
 * With { auto: true } nothing happens unless this week's fetch has not been made yet.
 * Answers { done: false } while posts remain: call again to continue.
 */
export async function POST(req: Request) {
  if (!integrationsUnlocked()) return NextResponse.json({ error: "Integrationer är avstängda tills Navet har ett lösenord (APP_PASSWORD)." }, { status: 403 });
  const { auto, postId } = await readJson<{ auto?: boolean; postId?: string }>(req);
  const result = await syncEngagement(await getStore(), { mode: auto === true ? "auto" : "manual", postId: typeof postId === "string" ? postId : undefined });
  if (!result.ok) console.error("[navet] linkedin engagement", result.message);
  return NextResponse.json(result);
}
