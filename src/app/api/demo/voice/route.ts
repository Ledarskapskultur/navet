import { readJson, withService } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** Demo: simulate a voice command creating a Google Task, then sync. */
export async function POST(req: Request) {
  const { text } = await readJson<{ text?: string }>(req);
  if (!text?.trim()) return Response.json({ error: "Text saknas" }, { status: 400 });
  return withService(async (svc) => {
    const result = await svc.simulateVoice(text);
    return { ...result, items: await svc.listItems() };
  });
}
