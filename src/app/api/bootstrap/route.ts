import { appStatus, withService } from "@/lib/server/api";

export const dynamic = "force-dynamic";

export function GET() {
  return withService(async (svc) => {
    const [items, projects, sync, status] = await Promise.all([
      svc.listItems(),
      svc.listProjects(),
      svc.getSyncState(),
      appStatus(svc),
    ]);
    return { items, projects, sync, status };
  });
}
