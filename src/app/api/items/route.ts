import { readJson, withService } from "@/lib/server/api";
import type { NewItemInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET() {
  return withService((svc) => svc.listItems());
}

export async function POST(req: Request) {
  const body = await readJson<{ item: NewItemInput; syncToGoogle?: boolean; listId?: string | null }>(req);
  if (!body.item?.title?.trim()) return Response.json({ error: "Titel saknas" }, { status: 400 });
  return withService((svc) => svc.createItem(body.item, { syncToGoogle: body.syncToGoogle, listId: body.listId }));
}
