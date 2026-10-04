import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let store: import("../../server/store").NavetStore;
let conn: typeof import("./connection");
let graph: typeof import("./graph");

beforeAll(async () => {
  process.env.NAVET_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "navet-ms-"));
  process.env.MICROSOFT_CLIENT_ID = "cid";
  process.env.MICROSOFT_CLIENT_SECRET = "secret";
  process.env.MICROSOFT_TENANT_ID = "tenant";
  store = await (await import("../../server/store")).getStore();
  conn = await import("./connection");
  graph = await import("./graph");
});

afterEach(() => vi.unstubAllGlobals());

describe("Outlook", () => {
  it("maps calendar events (UTC, all-day, cancelled) and follows paging", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      void _init;
      const page2 = url.includes("skiptoken");
      const body = page2
        ? { value: [{ id: "3", subject: "Heldag UGL", start: { dateTime: "2026-10-06T00:00:00.0000000" }, end: { dateTime: "2026-10-07T00:00:00.0000000" }, isAllDay: true }] }
        : {
            value: [
              { id: "1", subject: "Kundmöte", start: { dateTime: "2026-10-05T07:00:00.0000000" }, end: { dateTime: "2026-10-05T08:00:00.0000000" }, location: { displayName: "Teams" }, webLink: "https://outlook/1" },
              { id: "2", subject: "Inställt", isCancelled: true, start: { dateTime: "2026-10-05T09:00:00" }, end: { dateTime: "2026-10-05T10:00:00" } },
            ],
            "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=abc",
          };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const events = await graph.graphCalendarView("tok", new Date("2026-10-05T00:00:00Z"), new Date("2026-10-12T00:00:00Z"));
    expect(events.map((e) => e.title)).toEqual(["Kundmöte", "Heldag UGL"]);
    expect(events[0]).toMatchObject({ start: "2026-10-05T07:00:00.0000000Z", location: "Teams", link: "https://outlook/1" });
    expect(events[1].allDay).toBe(true);
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Prefer).toBe('outlook.timezone="UTC"');
  });

  it("maps flagged mail", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ value: [{ id: "m1", subject: "Kan du skicka offert senast fredag?", bodyPreview: "Hej!", receivedDateTime: "2026-10-04T10:00:00Z", from: { emailAddress: { name: "Anna Andersson", address: "anna@x.se" } } }] })),
    );
    const mails = await graph.graphFlaggedMail("tok");
    expect(mails[0]).toMatchObject({ from: "Anna Andersson", fromEmail: "anna@x.se", source: "outlook_mail" });
  });

  it("stores the connection encrypted and refreshes an expired token", async () => {
    await conn.saveMsConnection(store, {
      accessToken: "old", refreshToken: "r1", expiresAt: Date.now() - 1000,
      account: { name: "Carl-Fredrik", email: "cf@x.se" }, connectedAt: new Date().toISOString(),
    });
    const raw = JSON.stringify(await store.getKV("me", "microsoft_connection"));
    expect(raw).not.toContain("r1"); // encrypted at rest

    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe("https://login.microsoftonline.com/tenant/oauth2/v2.0/token");
      expect(String(init.body)).toContain("refresh_token=r1");
      return new Response(JSON.stringify({ access_token: "new", refresh_token: "r2", expires_in: 3600, scope: "" }));
    });
    expect(await conn.msAccessToken(store)).toBe("new");
    expect((await conn.loadMsConnection(store))?.refreshToken).toBe("r2");

    await conn.deleteMsConnection(store);
    expect(await conn.loadMsConnection(store)).toBeNull();
    await expect(conn.msAccessToken(store)).rejects.toBeInstanceOf(graph.GraphAuthError);
  });
});
