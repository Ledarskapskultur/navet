import { readJson, withService } from "@/lib/server/api";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const patch = await readJson<Partial<Project>>(req);
  return withService((svc) => svc.updateProject(id, patch));
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  return withService(async (svc) => {
    await svc.deleteProject(id);
    return { ok: true };
  });
}
