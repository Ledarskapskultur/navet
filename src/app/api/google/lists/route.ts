import { withService } from "@/lib/server/api";

export const dynamic = "force-dynamic";

export function GET() {
  return withService((svc) => svc.listGoogleLists());
}
