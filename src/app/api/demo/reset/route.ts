import { withService } from "@/lib/server/api";

export const dynamic = "force-dynamic";

export function POST() {
  return withService(async (svc) => {
    await svc.resetDemo();
    return { ok: true };
  });
}
