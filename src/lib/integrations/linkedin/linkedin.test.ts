import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let store: import("../../server/store").NavetStore;
let sync: typeof import("./sync");
let connections: typeof import("./connections");
let status: typeof import("../status");
let tester: typeof import("../test");
let envMod: typeof import("../../server/env");

const BASE = "https://navet.example";
const TOKEN = "AQX-test-token-that-is-long-enough-to-look-like-a-real-linkedin-access-token-0123456789";
const API = "https://api.linkedin.com/rest/memberSnapshotData";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noData = () => json({ status: 404, code: "NOT_FOUND", message: "No data found for this memberId" }, 404);

const row = (first: string, last: string, extra: Record<string, unknown> = {}) => ({
  "First Name": first,
  "Last Name": last,
  URL: `https://www.linkedin.com/in/${first}-${last}`.toLowerCase(),
  "Email Address": "",
  Company: "Exempel AB",
  Position: "Chef",
  "Connected On": "11 Oct 2026",
  ...extra,
});

interface Call {
  start: number;
  headers: Record<string, string>;
  url: string;
}

/**
 * A minimal Member Snapshot API: serves the given pages, answers "No data found" after the
 * last one, and records what Navet asked for.
 */
function fakeLinkedIn(pages: Record<string, unknown>[][], opts: { links?: boolean; fail?: Record<number, number> } = {}) {
  const calls: Call[] = [];
  const links = opts.links ?? true;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const q = new URL(url).searchParams;
    const start = Number(q.get("start") ?? 0);
    calls.push({ start, headers: init.headers as Record<string, string>, url });
    if (!url.startsWith(`${API}?`)) return json({ message: "not mocked" }, 500);
    if (opts.fail?.[start]) return json({ status: opts.fail[start], code: "SIMULATED", message: "Simulated" }, opts.fail[start]);
    if (start >= pages.length) return noData();
    const next = links && start + 1 < pages.length ? [{ type: "application/json", rel: "next", href: `/rest/memberSnapshotData?q=criteria&start=${start + 1}&domain=CONNECTIONS` }] : [];
    return json({
      paging: { start, count: 10, links: next, total: 1 },
      elements: [{ snapshotDomain: "CONNECTIONS", snapshotData: pages[start] }],
    });
  });
  return calls;
}

/** Pretend the last attempt was long ago, so the next fetch is neither on cooldown nor "not due". */
async function longAgo() {
  const s = await store.getKV<Record<string, unknown>>("me", "linkedin_state");
  if (s) await store.setKV("me", "linkedin_state", { ...s, lastAttemptAt: "2026-01-01T00:00:00.000Z" });
}

const card = async () => (await status.integrationStatuses(store, BASE))[2];

beforeAll(async () => {
  process.env.NAVET_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "navet-li-"));
  delete process.env.NAVET_DEMO;
  delete process.env.VERCEL;
  delete process.env.APP_PASSWORD;
  delete process.env.APP_URL;
  delete process.env.LINKEDIN_ACCESS_TOKEN;
  store = await (await import("../../server/store")).getStore();
  sync = await import("./sync");
  connections = await import("./connections");
  status = await import("../status");
  tester = await import("../test");
  envMod = await import("../../server/env");
});

beforeEach(async () => {
  await store.clearUser("me");
  envMod.env.linkedinAccessToken = TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  envMod.env.linkedinAccessToken = null;
  envMod.env.appPassword = null;
  delete process.env.VERCEL;
});

describe("Utan token", () => {
  it("kortet säger vad som saknas och ingenting hämtas eller visas", async () => {
    envMod.env.linkedinAccessToken = null;
    const calls = fakeLinkedIn([[row("Anna", "Andersson")]]);
    const li = await card();
    expect(li).toMatchObject({ state: "not_configured", available: true, connectUrl: null, canDisconnect: false, canSync: false, storedCount: null });
    expect(li.missingConfig).toEqual(["LINKEDIN_ACCESS_TOKEN"]);
    expect(li.capabilities.find((c) => c.id === "linkedin.connections")?.status).toBe("needs_permission");
    expect(await sync.syncLinkedInContacts(store, "manual")).toMatchObject({ ok: false });
    expect((await tester.testIntegration(store, "linkedin")).ok).toBe(false);
    expect(await sync.loadContacts(store)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("på en publik adress utan lösenord är LinkedIn avstängt", async () => {
    process.env.VERCEL = "1";
    const calls = fakeLinkedIn([[row("Anna", "Andersson")]]);
    expect((await card()).state).toBe("locked");
    expect(await sync.syncLinkedInContacts(store, "manual")).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
    envMod.env.appPassword = "hemligt";
    expect((await card()).state).toBe("connected");
  });
});

describe("Hämtning av kontakter", () => {
  it("läser alla sidor med rätt adress och headers, och sparar normaliserade kontakter", async () => {
    const calls = fakeLinkedIn([
      [row("Örjan", "Öst"), row("Anna", "Andersson", { Company: "Kommunen", Position: "HR-chef", "Connected On": "03 Jan 2024" })],
      [row("Bertil", "Berg", { URL: "https://www.linkedin.com/in/bertil-berg/" })],
    ]);
    const result = await sync.syncLinkedInContacts(store, "manual");
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/3 kontakter hämtades/);

    // Pages are numbered: 0, 1, and then the one that answers "No data found".
    expect(calls.map((c) => c.start)).toEqual([0, 1, 2]);
    expect(calls[0].url).toBe(`${API}?q=criteria&domain=CONNECTIONS`);
    expect(calls[1].url).toBe(`${API}?q=criteria&domain=CONNECTIONS&start=1`);
    for (const c of calls) expect(c.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, "Linkedin-Version": "202312" });

    const contacts = await sync.loadContacts(store);
    expect(contacts.map((c) => c.name)).toEqual(["Anna Andersson", "Bertil Berg", "Örjan Öst"]);
    expect(contacts[0]).toMatchObject({
      id: "li:linkedin.com/in/anna-andersson",
      title: "HR-chef",
      company: "Kommunen",
      connectedOn: "2024-01-03",
      profileUrl: "https://www.linkedin.com/in/anna-andersson",
      source: "linkedin",
    });
    expect(contacts[1].profileUrl).toBe("https://www.linkedin.com/in/bertil-berg");

    const li = await card();
    expect(li).toMatchObject({ state: "connected", storedCount: 3, canSync: true, canDisconnect: false, lastError: null, notice: null });
    expect(li.lastSyncAt).not.toBeNull();
    expect(li.connectedAt).not.toBeNull();
    expect(li.permissions[0]).toMatchObject({ scope: "r_dma_portability_self_serve", granted: true });
    expect(li.capabilities.find((c) => c.id === "linkedin.connections")).toMatchObject({ status: "active", effect: "read" });
  });

  it("utan next-länk fortsätter den sida för sida tills LinkedIn svarar att data saknas", async () => {
    const calls = fakeLinkedIn([[row("Anna", "Andersson")], [row("Bertil", "Berg")], [row("Cecilia", "Ceder")]], { links: false });
    expect((await sync.syncLinkedInContacts(store, "manual")).ok).toBe(true);
    expect(calls.map((c) => c.start)).toEqual([0, 1, 2, 3]);
    expect(await sync.loadContacts(store)).toHaveLength(3);
  });

  it("stannar om LinkedIn skickar samma sida om och om igen", async () => {
    const calls: number[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(Number(new URL(url).searchParams.get("start") ?? 0));
      return json({ paging: { links: [] }, elements: [{ snapshotDomain: "CONNECTIONS", snapshotData: [row("Anna", "Andersson")] }] });
    });
    expect((await sync.syncLinkedInContacts(store, "manual")).ok).toBe(true);
    expect(calls).toEqual([0, 1]);
    expect(await sync.loadContacts(store)).toHaveLength(1);
  });

  it("en ny hämtning uppdaterar befintliga kontakter i stället för att skapa dubbletter", async () => {
    fakeLinkedIn([[row("Anna", "Andersson"), row("Bertil", "Berg"), row("Cecilia", "Ceder")]]);
    await sync.syncLinkedInContacts(store, "manual");
    const first = await sync.loadContacts(store);
    await store.setKV("me", "linkedin_contacts", { contacts: first.map((c) => ({ ...c, firstSeenAt: "2026-01-01T00:00:00.000Z" })) });

    // Anna has a new job, Cecilia is no longer a connection, David is new.
    await longAgo();
    fakeLinkedIn([[row("Anna", "Andersson", { Company: "Nya Bolaget" }), row("Bertil", "Berg"), row("David", "Dahl")]]);
    expect((await sync.syncLinkedInContacts(store, "manual")).ok).toBe(true);
    const second = await sync.loadContacts(store);
    expect(second.map((c) => c.name)).toEqual(["Anna Andersson", "Bertil Berg", "David Dahl"]);
    expect(second[0]).toMatchObject({ company: "Nya Bolaget", firstSeenAt: "2026-01-01T00:00:00.000Z" });
    expect(second[2].firstSeenAt).not.toBe("2026-01-01T00:00:00.000Z");
    expect((await card()).storedCount).toBe(3);
  });

  it("en misstänkt kort lista ersätter inte de sparade kontakterna", async () => {
    fakeLinkedIn([[row("Anna", "Andersson"), row("Bertil", "Berg"), row("Cecilia", "Ceder"), row("David", "Dahl"), row("Erik", "Ek")]]);
    await sync.syncLinkedInContacts(store, "manual");
    await longAgo();
    fakeLinkedIn([[row("Anna", "Andersson", { Company: "Nya Bolaget" })]]);
    const result = await sync.syncLinkedInContacts(store, "manual");
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/de sparade kontakterna har behållits/);
    const contacts = await sync.loadContacts(store);
    expect(contacts).toHaveLength(5);
    expect(contacts[0].company).toBe("Nya Bolaget");
  });

  it("rader utan namn hoppas över, och andra adresser än LinkedIn blir aldrig länkar", async () => {
    fakeLinkedIn([[row("", "", { URL: "" }), row("Anna", "Andersson", { URL: "javascript:alert(1)" }), row("Bertil", "Berg", { URL: "https://evil.example/in/bertil" })]]);
    const result = await sync.syncLinkedInContacts(store, "manual");
    expect(result.message).toMatch(/2 kontakter hämtades.*1 rader utan namn/);
    const contacts = await sync.loadContacts(store);
    expect(contacts.map((c) => c.profileUrl)).toEqual([null, null]);
    expect(new Set(contacts.map((c) => c.id)).size).toBe(2);
  });

  it("ett avbrott mitt i hämtningen sparar det som kom och behåller resten", async () => {
    fakeLinkedIn([[row("Anna", "Andersson"), row("Bertil", "Berg")], [row("Cecilia", "Ceder")]]);
    await sync.syncLinkedInContacts(store, "manual");
    await longAgo();
    fakeLinkedIn([[row("Anna", "Andersson", { Position: "VD" })], [row("Bertil", "Berg")]], { fail: { 1: 500 } });
    const result = await sync.syncLinkedInContacts(store, "manual");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Hämtningen avbröts/);
    const contacts = await sync.loadContacts(store);
    expect(contacts.map((c) => c.name)).toEqual(["Anna Andersson", "Bertil Berg", "Cecilia Ceder"]);
    expect(contacts[0].title).toBe("VD");
    expect((await card()).state).toBe("error");
  });
});

describe("Fältnamn från LinkedIn", () => {
  it("rapporterar vilka fält som kom och hur de används, utan några värden", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    fakeLinkedIn([[row("Anna", "Andersson")]]);
    const result = await sync.syncLinkedInContacts(store, "manual");
    expect(result.message).toContain("Fält från LinkedIn: First Name, Last Name, URL, Email Address, Company, Position, Connected On.");
    expect(result.message).toContain("förnamn från ”First Name”");
    expect(result.message).toContain("kontaktdatum från ”Connected On”");
    expect(result.message).toContain("Används inte: Email Address.");
    expect(result.message).not.toMatch(/Andersson|Exempel AB/);
    // The field names are logged once, and never together with any contact data.
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toBe("[navet] linkedin CONNECTIONS fält: First Name, Last Name, URL, Email Address, Company, Position, Connected On");
    await longAgo();
    await sync.syncLinkedInContacts(store, "manual");
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("andra skrivsätt av samma fält känns igen", () => {
    const map = connections.detectFields(["firstName", "last_name", "profile_url", "companyName", "title", "connectedAt"]);
    expect(map).toMatchObject({ firstName: "firstName", lastName: "last_name", profileUrl: "profile_url", company: "companyName", title: "title", connectedOn: "connectedAt" });
    const contact = connections.toContact({ firstName: "Anna", last_name: "Andersson", connectedAt: "2025-03-04T10:00:00Z", companyName: " " }, map, "2026-10-11T00:00:00.000Z");
    expect(contact).toMatchObject({ name: "Anna Andersson", connectedOn: "2025-03-04", company: null });
  });

  it("fält som saknas på första raden hittas ändå", async () => {
    fakeLinkedIn([[{ "First Name": "Anna", "Last Name": "Andersson" }, row("Bertil", "Berg")]]);
    const result = await sync.syncLinkedInContacts(store, "manual");
    expect(result.message).toContain("företag från ”Company”");
    const contacts = await sync.loadContacts(store);
    expect(contacts.map((c) => c.company)).toEqual([null, "Exempel AB"]);
  });

  it("okända fältnamn sparar ingenting och säger vilka fält LinkedIn skickade", async () => {
    fakeLinkedIn([[{ Kolumn1: "Anna Andersson", Kolumn2: "Exempel AB" }]]);
    const result = await sync.syncLinkedInContacts(store, "manual");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/känner inte igen något namnfält/);
    expect(result.message).toContain("Fält från LinkedIn: Kolumn1, Kolumn2.");
    expect(result.message).not.toContain("Anna");
    expect(await sync.loadContacts(store)).toEqual([]);
    expect((await card()).state).toBe("error");
  });

  it("ett saknat fält nämns i stället för att gissas", () => {
    const keys = ["First Name", "Last Name", "Company"];
    const text = connections.describeFields(keys, connections.detectFields(keys));
    expect(text).toContain("Hittar inget fält för titel, kontaktdatum, profil-URL.");
  });

  it("datum tolkas när formatet är känt och lämnas annars som LinkedIn skrev det", () => {
    expect(connections.parseConnectedOn("11 Oct 2026")).toBe("2026-10-11");
    expect(connections.parseConnectedOn("3 Jan 2024")).toBe("2024-01-03");
    expect(connections.parseConnectedOn("October 11, 2026")).toBe("2026-10-11");
    expect(connections.parseConnectedOn("2026-10-11T08:00:00Z")).toBe("2026-10-11");
    expect(connections.parseConnectedOn("1791676800000")).toBe("2026-10-11");
    expect(connections.parseConnectedOn("i höstas")).toBe("i höstas");
    expect(connections.parseConnectedOn(null)).toBeNull();
  });
});

describe("Felhantering", () => {
  it.each([401, 403])("%i betyder att token är ogiltig eller har gått ut", async (code) => {
    const calls = fakeLinkedIn([[row("Anna", "Andersson")]], { fail: { 0: code } });
    const result = await sync.syncLinkedInContacts(store, "manual");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/ogiltig, har gått ut.*Skapa en ny i LinkedIns tokenverktyg/);
    const li = await card();
    expect(li.state).toBe("needs_reauth");
    expect(li.lastError).toMatch(/tokenverktyg/);
    expect(li.permissions[0].granted).toBe(false);
    // A rejected token is not tried again automatically.
    await longAgo();
    expect(await sync.syncLinkedInContacts(store, "auto")).toMatchObject({ skipped: true });
    expect(calls).toHaveLength(1);

    // A new token starts from a clean slate.
    envMod.env.linkedinAccessToken = `${TOKEN}-ny`;
    expect((await card()).state).toBe("connected");
    fakeLinkedIn([[row("Anna", "Andersson")]]);
    expect((await sync.syncLinkedInContacts(store, "auto")).ok).toBe(true);
    expect(await sync.loadContacts(store)).toHaveLength(1);
  });

  it("426 betyder fel Linkedin-Version", async () => {
    fakeLinkedIn([[row("Anna", "Andersson")]], { fail: { 0: 426 } });
    const result = await sync.syncLinkedInContacts(store, "manual");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Linkedin-Version 202312/);
    expect((await card()).state).toBe("error");
  });

  it("tomt svar direkt efter att token skapats visas som inte klart än, inte som ett fel", async () => {
    fakeLinkedIn([[row("Anna", "Andersson")]]);
    await sync.syncLinkedInContacts(store, "manual");
    await longAgo();
    fakeLinkedIn([]);
    const result = await sync.syncLinkedInContacts(store, "manual");
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/inte klar än/);
    const li = await card();
    expect(li.state).toBe("connected");
    expect(li.lastError).toBeNull();
    expect(li.notice).toMatch(/inte klar än/);
    // What was fetched earlier is left alone.
    expect(await sync.loadContacts(store)).toHaveLength(1);

    await longAgo();
    fakeLinkedIn([[row("Anna", "Andersson")]]);
    await sync.syncLinkedInContacts(store, "manual");
    expect((await card()).notice).toBeNull();
  });

  it("ett nätverksfel blir ett begripligt fel", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const result = await sync.syncLinkedInContacts(store, "manual");
    expect(result).toMatchObject({ ok: false, message: "Kunde inte nå LinkedIn. Kontrollera anslutningen och försök igen." });
  });
});

describe("Hur ofta LinkedIn anropas", () => {
  it("automatisk hämtning sker högst en gång per dygn", async () => {
    const calls = fakeLinkedIn([[row("Anna", "Andersson")]]);
    expect(sync.autoSyncDue(await sync.loadLinkedInState(store))).toBe(true);
    expect((await sync.syncLinkedInContacts(store, "auto")).skipped).toBeUndefined();
    const after = calls.length;
    expect(sync.autoSyncDue(await sync.loadLinkedInState(store))).toBe(false);
    expect(await sync.syncLinkedInContacts(store, "auto")).toMatchObject({ ok: true, skipped: true });
    expect(calls).toHaveLength(after);

    const state = await sync.loadLinkedInState(store);
    const day = sync.AUTO_SYNC_INTERVAL_MS;
    expect(sync.autoSyncDue(state, Date.parse(state.lastAttemptAt!) + day - 1000)).toBe(false);
    expect(sync.autoSyncDue(state, Date.parse(state.lastAttemptAt!) + day)).toBe(true);
  });

  it("en manuell hämtning direkt efter en annan körs inte", async () => {
    const calls = fakeLinkedIn([[row("Anna", "Andersson")]]);
    await sync.syncLinkedInContacts(store, "manual");
    const after = calls.length;
    expect(await sync.syncLinkedInContacts(store, "manual")).toMatchObject({ ok: true, skipped: true });
    expect(calls).toHaveLength(after);
  });

  it("samtidiga hämtningar delar på en", async () => {
    const calls = fakeLinkedIn([[row("Anna", "Andersson")]]);
    const [a, b] = await Promise.all([sync.syncLinkedInContacts(store, "manual"), sync.syncLinkedInContacts(store, "manual")]);
    expect(a).toBe(b);
    expect(calls.map((c) => c.start)).toEqual([0, 1]);
  });

  it("Testa anslutningen läser bara första sidan och sparar inga kontakter", async () => {
    const calls = fakeLinkedIn([[row("Anna", "Andersson"), row("Bertil", "Berg")], [row("Cecilia", "Ceder")]]);
    const result = await tester.testIntegration(store, "linkedin");
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/Anslutningen fungerar\. Första sidan innehåller 2 kontakter\. Fält från LinkedIn: First Name/);
    expect(calls).toHaveLength(1);
    expect(await sync.loadContacts(store)).toEqual([]);
  });
});

describe("Sökning", () => {
  it("söker i namn och företag, oavsett stora och små bokstäver", async () => {
    fakeLinkedIn([[row("Anna", "Andersson", { Company: "Kommunen" }), row("Bertil", "Berg", { Company: "Åkeriet AB" }), row("Örjan", "Öst", { Company: "Kommunen", Position: "Åkare" })]]);
    await sync.syncLinkedInContacts(store, "manual");
    const names = async (q: string) => (await sync.queryContacts(store, { q })).contacts.map((c) => c.name);
    expect(await names("anna")).toEqual(["Anna Andersson"]);
    expect(await names("KOMMUNEN")).toEqual(["Anna Andersson", "Örjan Öst"]);
    expect(await names("åkeri")).toEqual(["Bertil Berg"]);
    expect(await names("kommunen öst")).toEqual(["Örjan Öst"]);
    // The title is not searched.
    expect(await names("åkare")).toEqual([]);
    expect(await sync.queryContacts(store, { q: "", limit: 2 })).toMatchObject({ matching: 3, total: 3, contacts: [{ name: "Anna Andersson" }, { name: "Bertil Berg" }] });
    expect((await sync.queryContacts(store, { limit: 2, offset: 2 })).contacts.map((c) => c.name)).toEqual(["Örjan Öst"]);
  });
});

describe("Token", () => {
  it("lämnar aldrig servern: inte i status, svar, sparad data eller loggar", async () => {
    const logs: unknown[] = [];
    vi.spyOn(console, "info").mockImplementation((...a) => void logs.push(a));
    vi.spyOn(console, "error").mockImplementation((...a) => void logs.push(a));
    fakeLinkedIn([[row("Anna", "Andersson")]]);
    const out = [await sync.syncLinkedInContacts(store, "manual"), await tester.testIntegration(store, "linkedin"), await card()];
    await longAgo();
    fakeLinkedIn([[row("Anna", "Andersson")]], { fail: { 0: 401 } });
    out.push(await sync.syncLinkedInContacts(store, "manual"), await card());
    const stored = [await store.getKV("me", "linkedin_state"), await store.getKV("me", "linkedin_contacts")];
    expect(JSON.stringify([out, stored, logs])).not.toContain(TOKEN.slice(0, 12));
  });

  it("ett felklistrat värde känns igen på formen utan att värdet visas", async () => {
    envMod.env.linkedinAccessToken = `"${TOKEN}"`;
    expect(envMod.linkedinTokenProblem()).toBe("quoted");
    const li = await card();
    expect(li.configWarning).toMatch(/citattecken/);
    expect(JSON.stringify(li)).not.toContain(TOKEN.slice(0, 12));
    envMod.env.linkedinAccessToken = `Bearer ${TOKEN}`;
    expect(envMod.linkedinTokenProblem()).toBe("bearer_prefix");
    envMod.env.linkedinAccessToken = `${TOKEN.slice(0, 40)} ${TOKEN.slice(40)}`;
    expect(envMod.linkedinTokenProblem()).toBe("whitespace");
    envMod.env.linkedinAccessToken = "AQX-kort";
    expect(envMod.linkedinTokenProblem()).toBe("too_short");
    envMod.env.linkedinAccessToken = TOKEN;
    expect(envMod.linkedinTokenProblem()).toBeNull();
    expect((await card()).configWarning).toBeNull();
  });

  it("påminner när token närmar sig ett år", async () => {
    const state = await sync.loadLinkedInState(store);
    const seen = Date.parse(state.tokenSeenAt!);
    expect(sync.tokenAgeWarning(state, seen + 300 * 86400_000)).toBeNull();
    expect(sync.tokenAgeWarning(state, seen + 340 * 86400_000)).toMatch(/använts i 340 dagar/);
  });
});
