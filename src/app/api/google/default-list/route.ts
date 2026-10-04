import { readJson, withService } from "@/lib/server/api";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const { listId } = await readJson<{ listId?: string }>(req);
  if (!listId) return Response.json({ error: "listId saknas" }, { status: 400 });
  return withService(async (svc) => {
    await svc.setDefaultList(listId);
    return svc.getSyncState();
  });
}
