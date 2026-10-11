import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let store: import("../server/store").NavetStore;
let conn: typeof import("./microsoft/connection");
let providers: typeof import("./microsoft/providers");
let status: typeof import("./status");
let tester: typeof import("./test");
let flow: typeof import("./microsoft/flow");
let envMod: typeof import("../server/env");

const BASE = "https://navet.example";
const connection = (over: Partial<import("./microsoft/connection").MsConnection> = {}) => ({
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresAt: Date.now() + 3600_000,
  account: { name: "Test Person", email: "test@example.com" },
  connectedAt: "2026-10-01T08:00:00.000Z",
  scopes: ["Calendars.Read", "Mail.Read", "User.Read"],
  features: { mail: true, calendar: true },
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A minimal Microsoft Graph: answers the calls Navet makes, records what was asked. */
function fakeGraph(opts: { status?: number } = {}) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    const path = decodeURIComponent(url.replace("https://graph.microsoft.com/v1.0", "").replace(/\+/g, " "));
    calls.push(path);
    if (opts.status) return json({ error: { code: "Simulated" } }, opts.status);
    if (path.startsWith("/me?")) return json({ displayName: "Test Person", mail: "test@example.com", userPrincipalName: "test@example.com" });
    if (path.startsWith("/me/mailFolders/inbox?")) return json({ unreadItemCount: 4, totalItemCount: 90 });
    if (path.startsWith("/me/mailFolders/inbox/messages")) {
      const high = path.includes("importance eq 'high'");
      return json({ value: [{ id: high ? "hi" : "new", subject: high ? "Viktigt" : null, bodyPreview: "Hej", receivedDateTime: "2026-10-10T10:00:00Z", isRead: false, importance: high ? "high" : "normal", flag: { flagStatus: "notFlagged" } }] });
    }
    if (path.startsWith("/me/messages")) {
      return json({ "@odata.count": 12, value: [{ id: "f1", subject: "Offert", bodyPreview: "…", receivedDateTime: "2026-10-09T10:00:00Z", flag: { flagStatus: "flagged" }, from: { emailAddress: { name: "Anna", address: "anna@example.com" } } }] });
    }
    if (path.startsWith("/me/calendar?")) return json({ name: "Kalender" });
    if (path.startsWith("/me/calendarView")) return json({ value: [] });
    return json({ error: { code: "NotMocked" } }, 404);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

beforeAll(async () => {
  process.env.NAVET_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "navet-int-"));
  process.env.MICROSOFT_CLIENT_ID = "cid";
  process.env.MICROSOFT_CLIENT_SECRET = "secret";
  process.env.MICROSOFT_TENANT_ID = "tenant";
  delete process.env.NAVET_DEMO;
  delete process.env.VERCEL;
  delete process.env.APP_PASSWORD;
  delete process.env.APP_URL;
  delete process.env.LINKEDIN_ACCESS_TOKEN;
  store = await (await import("../server/store")).getStore();
  conn = await import("./microsoft/connection");
  providers = await import("./microsoft/providers");
  status = await import("./status");
  tester = await import("./test");
  flow = await import("./microsoft/flow");
  envMod = await import("../server/env");
});

beforeEach(async () => {
  await conn.deleteMsConnection(store);
});

afterEach(() => {
  vi.unstubAllGlobals();
  envMod.env.demoMode = false;
  envMod.env.appPassword = null;
  delete process.env.VERCEL;
});

describe("Ingen simulerad data", () => {
  it("utan anslutning returneras ingenting, och orsaken anges", async () => {
    const calendar = await providers.getCalendarProvider(store);
    const mail = await providers.getMailProvider(store);
    expect(calendar.kind).toBe("none");
    expect(calendar.state).toBe("disconnected");
    expect(await calendar.listEvents(new Date(), new Date(Date.now() + 86400_000))).toEqual([]);
    expect(mail.kind).toBe("none");
    expect(await mail.listFlagged()).toEqual([]);
    expect((await mail.summary()).unreadCount).toBeNull();
  });

  it("exempeldata används bara i demoläge", async () => {
    envMod.env.demoMode = true;
    expect((await providers.getMailProvider(store)).kind).toBe("demo");
    expect((await providers.getCalendarProvider(store)).kind).toBe("demo");
  });

  it("en ansluten del stängs av utan att den andra påverkas", async () => {
    await conn.saveMsConnection(store, connection({ features: { mail: true, calendar: false } }));
    expect((await providers.getMailProvider(store)).kind).toBe("outlook");
    expect((await providers.getCalendarProvider(store)).kind).toBe("none");
  });
});

describe("Skydd på publik driftsättning", () => {
  it("integrationer är avstängda på en publik adress utan lösenord", async () => {
    await conn.saveMsConnection(store, connection());
    process.env.VERCEL = "1";
    expect(envMod.integrationsUnlocked()).toBe(false);
    const mail = await providers.getMailProvider(store);
    expect(mail.kind).toBe("none");
    expect(mail.state).toBe("locked");
    const [card] = await status.integrationStatuses(store, BASE);
    expect(card.state).toBe("locked");
    expect(card.account).toBeNull();
    expect(card.connectUrl).toBeNull();

    envMod.env.appPassword = "hemligt";
    expect(envMod.integrationsUnlocked()).toBe(true);
    expect((await providers.getMailProvider(store)).kind).toBe("outlook");
  });
});

describe("Anslutningen", () => {
  it("läser anslutningar från äldre versioner som läsbehörighet för mejl och kalender", async () => {
    const { encrypt } = await import("../server/crypto");
    const legacy = { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1000, account: { name: "T", email: "t@example.com" }, connectedAt: "2026-10-04T00:00:00.000Z" };
    await store.setKV("me", "microsoft_connection", { sealed: encrypt(legacy) });
    const c = await conn.loadMsConnection(store);
    expect(c?.scopes).toEqual(["User.Read", "Calendars.Read", "Mail.Read"]);
    expect(c?.features).toEqual({ mail: true, calendar: true });
  });

  it("koppla från en del behåller den andra; nycklarna raderas när inget är kvar", async () => {
    await conn.saveMsConnection(store, connection());
    const left = await conn.disableMsFeature(store, "mail");
    expect(left?.features).toEqual({ mail: false, calendar: true });
    // The mail permission is dropped from what Navet holds, and the old token is not reused.
    expect(left?.scopes).toEqual(["Calendars.Read", "User.Read"]);
    await expect(conn.msAccessToken(store, "mail")).rejects.toThrow();
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return json({ access_token: "access-cal", refresh_token: "refresh-2", expires_in: 3600, scope: "Calendars.Read User.Read" });
    });
    expect(await conn.msAccessToken(store, "calendar")).toBe("access-cal");
    const asked = new URLSearchParams(bodies[0]).get("scope");
    expect(asked).toContain("Calendars.Read");
    expect(asked).not.toContain("Mail.Read");
    vi.unstubAllGlobals();
    expect(await conn.disableMsFeature(store, "calendar")).toBeNull();
    expect(await conn.loadMsConnection(store)).toBeNull();
    expect(JSON.stringify(await store.getKV("me", "microsoft_connection"))).toBe('{"sealed":""}');
  });

  it("samtidiga anrop delar på en förnyelse av åtkomstnyckeln", async () => {
    await conn.saveMsConnection(store, connection({ expiresAt: Date.now() - 1000 }));
    const fetchMock = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600, scope: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/User.Read" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const tokens = await Promise.all([conn.msAccessToken(store, "mail"), conn.msAccessToken(store, "calendar"), conn.msAccessToken(store)]);
    expect(tokens).toEqual(["access-2", "access-2", "access-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await conn.loadMsConnection(store))?.refreshToken).toBe("refresh-2");
  });

  it("avvisad refresh token markerar att kontot måste anslutas igen", async () => {
    await conn.saveMsConnection(store, connection({ expiresAt: Date.now() - 1000 }));
    vi.stubGlobal("fetch", async () => json({ error: "invalid_grant", error_description: "AADSTS70008: expired\r\nTrace ID: abc" }, 400));
    const mail = await providers.getMailProvider(store);
    await expect(mail.summary()).rejects.toThrow(/Anslut kontot igen/);
    expect((await providers.msFeatureStatus(store, "mail")).state).toBe("needs_reauth");
    // Nothing is fetched again until the user reconnects.
    expect((await providers.getMailProvider(store)).kind).toBe("none");
    const [card] = await status.integrationStatuses(store, BASE);
    expect(card.state).toBe("needs_reauth");
    expect(card.connectUrl).toContain("grant=mail_read");
    expect(card.lastError).toMatch(/Anslut kontot igen/);
  });

  it("ett enstaka 401 från Graph provar en ny nyckel innan kontot markeras för omanslutning", async () => {
    await conn.saveMsConnection(store, connection());
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url.includes("login.microsoftonline.com")) return json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600, scope: "Mail.Read Calendars.Read User.Read" });
      const token = (init.headers as Record<string, string>).Authorization;
      seen.push(token);
      if (token === "Bearer access-1") return json({ error: { code: "InvalidAuthenticationToken" } }, 401);
      return json({ value: [] });
    });
    await expect((await providers.getMailProvider(store)).listFlagged()).resolves.toEqual([]);
    expect(seen).toEqual(["Bearer access-1", "Bearer access-2"]);
    expect((await providers.msFeatureStatus(store, "mail")).state).toBe("connected");
  });

  it("frånkoppling under en pågående förnyelse återskapar inte anslutningen", async () => {
    await conn.saveMsConnection(store, connection({ expiresAt: Date.now() - 1000 }));
    vi.stubGlobal("fetch", async () => {
      await conn.deleteMsConnection(store); // the user disconnects while Microsoft is answering
      return json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600, scope: "Mail.Read User.Read" });
    });
    await expect(conn.msAccessToken(store, "mail")).rejects.toThrow();
    expect(await conn.loadMsConnection(store)).toBeNull();
  });

  it("utgången klienthemlighet ger ett begripligt fel i stället för omanslutning", async () => {
    await conn.saveMsConnection(store, connection({ expiresAt: Date.now() - 1000 }));
    vi.stubGlobal("fetch", async () => json({ error: "invalid_client", error_description: "AADSTS7000222: expired client secret" }, 401));
    await expect(conn.msAccessToken(store, "mail")).rejects.toThrow(/MICROSOFT_CLIENT_SECRET/);
  });
});

describe("Mejlöversikt och status", () => {
  it("hämtar räknare, flaggade, senaste och viktiga med läsbehörighet", async () => {
    await conn.saveMsConnection(store, connection());
    const calls = fakeGraph();
    const summary = await (await providers.getMailProvider(store)).summary();
    expect(summary.unreadCount).toBe(4);
    expect(summary.flaggedCount).toBe(12);
    expect(summary.flagged[0]).toMatchObject({ from: "Anna", flagged: true, source: "outlook_mail" });
    expect(summary.latest[0]).toMatchObject({ subject: "(utan ämne)", from: "Okänd avsändare", isRead: false });
    expect(summary.important[0]).toMatchObject({ importance: "high" });
    // Graph demands that the $orderby property leads the $filter.
    expect(calls.find((c) => c.includes("importance eq 'high'"))).toMatch(/\$filter=receivedDateTime ge .* and importance eq 'high'&\$orderby=receivedDateTime desc/);
    const [mail] = await status.integrationStatuses(store, BASE);
    expect(mail.state).toBe("connected");
    expect(mail.lastSyncAt).not.toBeNull();
  });

  it("en del av översikten som fallerar tömmer inte resten", async () => {
    await conn.saveMsConnection(store, connection());
    vi.stubGlobal("fetch", async (url: string) => {
      const path = decodeURIComponent(url);
      if (path.includes("/mailFolders/inbox?")) return json({ error: { code: "Simulated" } }, 500);
      if (path.includes("/me/messages")) return json({ value: [] });
      return json({ value: [{ id: "n", subject: "Hej", bodyPreview: "", receivedDateTime: "2026-10-10T10:00:00Z" }] });
    });
    const summary = await (await providers.getMailProvider(store)).summary();
    expect(summary.unreadCount).toBeNull();
    expect(summary.flaggedCount).toBe(0);
    expect(summary.latest).toHaveLength(1);
  });

  it("ett Graph-fel sparas som senaste fel och försvinner när det fungerar igen", async () => {
    await conn.saveMsConnection(store, connection());
    fakeGraph({ status: 403 });
    await expect((await providers.getMailProvider(store)).summary()).rejects.toThrow(/saknar behörighet/);
    const [failed, calendar] = await status.integrationStatuses(store, BASE);
    let mail = failed;
    expect(mail.state).toBe("error");
    expect(mail.lastError).toMatch(/saknar behörighet/);
    expect(calendar.state).toBe("connected");

    fakeGraph();
    const result = await tester.testIntegration(store, "outlook_mail");
    expect(result).toMatchObject({ ok: true });
    expect(result.message).toMatch(/90 mejl, varav 4 olästa/);
    [mail] = await status.integrationStatuses(store, BASE);
    expect(mail.state).toBe("connected");
    expect(mail.lastError).toBeNull();
  });

  it("korten visar behörigheter, funktioner och rätt redirect-URI", async () => {
    await conn.saveMsConnection(store, connection({ features: { mail: true, calendar: false }, scopes: ["Mail.Read", "User.Read"] }));
    const [mail, calendar, linkedin] = await status.integrationStatuses(store, BASE);

    expect(mail.redirectUri).toBe("https://navet.example/api/auth/microsoft/callback");
    expect(mail.account?.email).toBe("test@example.com");
    expect(mail.connectUrl).toBeNull();
    expect(Object.fromEntries(mail.permissions.map((p) => [p.scope, p.granted]))).toEqual({ "User.Read": true, "Mail.Read": true, "Mail.ReadWrite": false, "Mail.Send": false });
    expect(mail.capabilities.find((c) => c.id === "mail.summary")?.status).toBe("active");
    expect(mail.capabilities.find((c) => c.id === "mail.send")).toMatchObject({ status: "planned", effect: "write" });

    expect(calendar.state).toBe("disconnected");
    expect(calendar.account).toBeNull();
    expect(calendar.connectUrl).toBe("/api/auth/microsoft?grant=calendar_read&return=/integrationer");
    expect(calendar.permissions.every((p) => !p.granted)).toBe(true);

    expect(linkedin).toMatchObject({ state: "not_configured", available: true, connectUrl: null, canDisconnect: false });
    expect(linkedin.missingConfig).toEqual(["LINKEDIN_ACCESS_TOKEN"]);
    expect(mail.canDisconnect).toBe(true);
    expect(mail.canSync).toBe(false);
    expect(linkedin.capabilities.filter((c) => c.status === "unavailable").map((c) => c.id)).toEqual(["linkedin.stats", "linkedin.social"]);
    // Everything that changes something outside Navet is marked as needing approval.
    const all = [...mail.capabilities, ...calendar.capabilities, ...linkedin.capabilities];
    for (const id of ["mail.flag", "mail.draft", "mail.send", "calendar.create", "calendar.change", "linkedin.publish"]) {
      expect(all.find((c) => c.id === id)?.effect).toBe("write");
    }
  });

  it("status och test avslöjar aldrig nycklar", async () => {
    await conn.saveMsConnection(store, connection());
    fakeGraph();
    const out = JSON.stringify([await status.integrationStatuses(store, BASE), await tester.testIntegration(store, "outlook_calendar")]);
    expect(out).not.toMatch(/access-1|refresh-1|secret/);
  });
});

describe("Felklistrad klienthemlighet", () => {
  it("känner igen ett Secret ID, citattecken och ett avklippt värde utan att visa värdet", async () => {
    const original = envMod.env.msClientSecret;
    try {
      envMod.env.msClientSecret = "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
      expect(envMod.msSecretProblem()).toBe("secret_id");
      const [mail, calendar] = await status.integrationStatuses(store, BASE);
      expect(mail.configWarning).toMatch(/Secret ID, inte dess Value/);
      expect(calendar.configWarning).toBe(mail.configWarning);
      expect(JSON.stringify(mail)).not.toContain("1b2c3d4e");
      expect(envMod.msSecretShape()).toBe("längd 36, secret_id");

      envMod.env.msClientSecret = '"abc8Q~realistic-looking-secret-value-1234567"';
      expect(envMod.msSecretProblem()).toBe("quoted");
      envMod.env.msClientSecret = "abc8Q~short";
      expect(envMod.msSecretProblem()).toBe("too_short");
      envMod.env.msClientSecret = "abc8Q~realistic-looking-secret-value-1234567";
      expect(envMod.msSecretProblem()).toBeNull();
      expect((await status.integrationStatuses(store, BASE))[0].configWarning).toBeNull();
    } finally {
      envMod.env.msClientSecret = original;
    }
  });
});

describe("Återgång efter inloggning", () => {
  it("tillåter bara sökvägar inom Navet", () => {
    expect(flow.safeReturnPath("/kalender")).toBe("/kalender");
    expect(flow.safeReturnPath("//evil.example")).toBe("/integrationer");
    expect(flow.safeReturnPath("https://evil.example")).toBe("/integrationer");
    expect(flow.safeReturnPath("/\\evil.example")).toBe("/integrationer");
    // URL parsing drops tabs and newlines, which would turn these into "//evil.example".
    expect(flow.safeReturnPath("/\t/evil.example")).toBe("/integrationer");
    expect(flow.safeReturnPath("/\n/evil.example")).toBe("/integrationer");
    expect(flow.safeReturnPath("/kalender?vecka=42")).toBe("/kalender?vecka=42");
    expect(flow.returnUrl("/\t/evil.example", "https://navet.example").href).toBe("https://navet.example/integrationer");
    expect(flow.returnUrl("/kalender", "https://navet.example").href).toBe("https://navet.example/kalender");
    expect(flow.safeReturnPath(null)).toBe("/integrationer");
  });
});
