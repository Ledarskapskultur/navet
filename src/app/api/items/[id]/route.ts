import { readJson, withService } from "@/lib/server/api";
import type { ItemPatch } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: RouteContext<"/api/items/[id]">) {
  const { id } = await ctx.params;
  const body = await readJson<{ patch: ItemPatch; syncToGoogle?: boolean; listId?: string | null; unlink?: boolean }>(req);
  return withService((svc) =>
    body.unlink ? svc.unlinkItem(id) : svc.updateItem(id, body.patch ?? {}, { syncToGoogle: body.syncToGoogle, listId: body.listId }),
  );
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/items/[id]">) {
  const { id } = await ctx.params;
  const deleteExternal = new URL(req.url).searchParams.get("external") !== "0";
  return withService(async (svc) => {
    await svc.deleteItem(id, { deleteExternal });
    return { ok: true };
  });
}
