import { withService } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** Runs a two-way reconciliation with Google Tasks and returns fresh data. */
export function POST() {
  return withService(async (svc) => {
    const result = await svc.syncGoogle();
    return { ...result, items: await svc.listItems() };
  });
}
