import "server-only";
import type { NavetStore } from "../server/store";
import { msAccessToken, recordMsResult } from "./microsoft/connection";
import { graphCalendarInfo, graphInboxCounts, graphMe } from "./microsoft/graph";
import { msFeatureStatus } from "./microsoft/providers";
import type { MsFeature } from "./microsoft/scopes";
import { STATE_LABEL, type IntegrationId } from "./types";

export interface TestResult {
  ok: boolean;
  message: string;
}

async function testMicrosoft(store: NavetStore, feature: MsFeature): Promise<TestResult> {
  const { state } = await msFeatureStatus(store, feature);
  if (state === "not_configured" || state === "locked" || state === "disconnected") {
    return { ok: false, message: `${STATE_LABEL[state]}. Det finns inget konto att testa mot.` };
  }
  try {
    // Also tried when the state is needs_reauth: the token may work again (e.g. after a
    // new client secret), and a successful call clears the flag.
    const token = await msAccessToken(store, feature);
    const me = await graphMe(token);
    let detail: string;
    if (feature === "mail") {
      const { unread, total } = await graphInboxCounts(token);
      detail = `Inkorgen har ${total} mejl, varav ${unread} olästa.`;
    } else {
      const { name } = await graphCalendarInfo(token);
      detail = `Kalendern ”${name}” kan läsas.`;
    }
    await recordMsResult(store, feature, null);
    return { ok: true, message: `Anslutningen fungerar för ${me.email}. ${detail}` };
  } catch (err) {
    await recordMsResult(store, feature, err);
    return { ok: false, message: (err as Error).message || "Testet misslyckades." };
  }
}

export async function testIntegration(store: NavetStore, id: IntegrationId): Promise<TestResult> {
  if (id === "outlook_mail") return testMicrosoft(store, "mail");
  if (id === "outlook_calendar") return testMicrosoft(store, "calendar");
  return { ok: false, message: "LinkedIn-anslutningen byggs i fas 4. Det finns inget att testa än." };
}
