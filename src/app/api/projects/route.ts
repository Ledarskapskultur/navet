import { readJson, withService } from "@/lib/server/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson<{ name?: string; description?: string; aliases?: string[] }>(req);
  if (!body.name?.trim()) return Response.json({ error: "Namn saknas" }, { status: 400 });
  return withService((svc) => svc.createProject({ name: body.name!, description: body.description, aliases: body.aliases }));
}
