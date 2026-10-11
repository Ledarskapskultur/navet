import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let store: import("../../server/store").NavetStore;
let eng: typeof import("./engagement");
let posts: typeof import("./posts");
let segments: typeof import("./segments");
let leads: typeof import("../../linkedin-leads");
let status: typeof import("../status");
let envMod: typeof import("../../server/env");

const LI_TOKEN = "AQX-test-token-that-is-long-enough-to-look-like-a-real-linkedin-access-token-0123456789";
const APIFY_TOKEN = "apify_api_TESTtoken0123456789abcdefghijklmnop";
const SNAPSHOT = "https://api.linkedin.com/rest/memberSnapshotData";
const APIFY = "https://api.apify.com/v2/acts/";
const DAY = 86400_000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const exportDate = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 19).replace("T", " ");
const shareLink = (n: number) => `https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A${n}`;
const share = (n: number, daysAgo: number, text = `Inlägg nummer ${n} om ledarskap`) => ({
  Date: exportDate(daysAgo),
  ShareLink: shareLink(n),
  ShareCommentary: text,
  SharedUrl: "",
  MediaUrl: "",
  Visibility: "MEMBER_NETWORK",
});
const person = (name: string, subtitle: string, extra: Record<string, unknown> = {}) => ({
  name,
  subtitle,
  url_profile: `https://www.linkedin.com/in/${name.toLowerCase().replace(/\s+/g, "-")}`,
  ...extra,
});

interface ApifyCall {
  actor: string;
  input: Record<string, unknown>;
  auth: string;
  url: string;
}

interface World {
  shares?: Record<string, unknown>[];
  /** Per post id (the number in the share link): who liked and commented, and the totals */
  likers?: Record<string, Record<string, unknown>[]>;
  commenters?: Record<string, Record<string, unknown>[]>;
  totals?: Record<string, { total_reactions: number; comments: number; shares: number }>;
  apifyStatus?: number;
  linkedinStatus?: number;
}

/** Stand-ins for LinkedIn's snapshot API and Apify's two actors. Records what Navet asked Apify for. */
function fakeWorld(world: World) {
  const calls: ApifyCall[] = [];
  const linkedin: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    if (url.startsWith(SNAPSHOT)) {
      const q = new URL(url).searchParams;
      linkedin.push(`${q.get("domain")}:${q.get("start") ?? 0}`);
      if (world.linkedinStatus) return json({ status: world.linkedinStatus, message: "Simulated" }, world.linkedinStatus);
      if (q.get("domain") !== "MEMBER_SHARE_INFO" || Number(q.get("start") ?? 0) > 0 || !world.shares?.length) {
        return json({ status: 404, message: "No data found for this memberId" }, 404);
      }
      return json({ paging: { links: [] }, elements: [{ snapshotDomain: "MEMBER_SHARE_INFO", snapshotData: world.shares }] });
    }
    if (url.startsWith(APIFY)) {
      const actor = url.slice(APIFY.length).split("/")[0];
      const input = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ actor, input, auth: headers.Authorization, url });
      if (world.apifyStatus) return json({ error: { type: "simulated" } }, world.apifyStatus);
      const postUrl = String((input.urls as string[] | undefined)?.[0] ?? (input.post_urls as string[])[0]);
      const id = (/:(\d+)\/?$/.exec(postUrl) ?? /-activity-(\d+)-/.exec(postUrl))?.[1] ?? "";
      if (actor.startsWith("apimaestro~linkedin-post-detail")) {
        const t = world.totals?.[id];
        return json(t ? [{ post: { text: `Text för ${id}`, created_at: new Date().toISOString() }, author: { name: "Carl-Fredrik" }, stats: t }] : []);
      }
      const list = (input.type === "likers" ? world.likers : world.commenters)?.[id] ?? [];
      return json(list.slice(0, Number(input.resultsLimit)));
    }
    return json({ message: "not mocked" }, 500);
  });
  return { calls, linkedin };
}

/** Pretend the latest run was long ago, so a new manual run is not on cooldown. */
async function longAgo() {
  const s = await store.getKV<Record<string, unknown>>("me", "linkedin_engagement_state");
  if (s) await store.setKV("me", "linkedin_engagement_state", { ...s, lastRunAt: "2026-01-01T00:00:00.000Z" });
}

beforeAll(async () => {
  process.env.NAVET_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "navet-eng-"));
  delete process.env.NAVET_DEMO;
  delete process.env.VERCEL;
  delete process.env.APP_PASSWORD;
  delete process.env.APP_URL;
  store = await (await import("../../server/store")).getStore();
  eng = await import("./engagement");
  posts = await import("./posts");
  segments = await import("./segments");
  leads = await import("../../linkedin-leads");
  status = await import("../status");
  envMod = await import("../../server/env");
});

beforeEach(async () => {
  await store.clearUser("me");
  envMod.env.linkedinAccessToken = LI_TOKEN;
  envMod.env.apifyToken = APIFY_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  envMod.env.linkedinAccessToken = null;
  envMod.env.apifyToken = null;
  envMod.env.appPassword = null;
  delete process.env.VERCEL;
});

describe("Målgrupper", () => {
  it.each([
    ["Utbildningsledare på Nackademin", "yh"],
    ["Rektor | YH Mitt", "yh"],
    ["HR-chef på Sundsvalls kommun", "public"],
    ["Enhetschef, Region Västernorrland", "public"],
    ["Projektledare på Stockholms stad", "public"],
    ["VD på Exempel AB", "company"],
    ["Head of People & Culture at Testbolaget", "company"],
    ["Grundare och ägare", "company"],
    ["Teamledare på Exempel AB", "ugl"],
    ["Gruppchef kundservice", "ugl"],
    ["HR-generalist", "ugl"],
    ["Student på Mälardalens universitet", "public"],
    ["Fotograf", "other"],
    ["Säljare på Vdc Sverige", "other"],
    ["", "other"],
  ])("%s räknas som %s", (subtitle, expected) => {
    expect(segments.classifySegment(subtitle)).toBe(expected);
  });

  it("delar upp raden under namnet i titel och företag", () => {
    expect(segments.parseSubtitle("HR-chef på Exempel AB | Ledarskap")).toEqual({ title: "HR-chef", company: "Exempel AB" });
    expect(segments.parseSubtitle("Founder & CEO at SaaS Inc")).toEqual({ title: "Founder & CEO", company: "SaaS Inc" });
    expect(segments.parseSubtitle("Ledarskapsutvecklare")).toEqual({ title: "Ledarskapsutvecklare", company: null });
    expect(segments.parseSubtitle(null)).toEqual({ title: null, company: null });
  });
});

describe("Egna inlägg från LinkedIn", () => {
  it("känner igen fälten i LinkedIns exportformat och säger vad som saknas", () => {
    const keys = ["Date", "ShareLink", "ShareCommentary", "SharedUrl", "MediaUrl", "Visibility"];
    const map = posts.detectPostFields(keys);
    expect(map).toEqual({ date: "Date", link: "ShareLink", text: "ShareCommentary", visibility: "Visibility" });
    expect(posts.describePostFields(["ShareLink"], posts.detectPostFields(["ShareLink"]))).toContain("Hittar inget fält för datum, text, synlighet.");
  });

  it("gör om länken till en ren LinkedIn-adress och avvisar allt annat", () => {
    expect(posts.cleanPostUrl(shareLink(7123))).toBe("https://www.linkedin.com/feed/update/urn:li:share:7123/");
    expect(posts.cleanPostUrl("https://www.linkedin.com/posts/carl-fredrik_ledarskap-activity-7456-abcd?utm_source=share")).toBe(
      "https://www.linkedin.com/posts/carl-fredrik_ledarskap-activity-7456-abcd",
    );
    expect(posts.cleanPostUrl("https://evil.example/feed/update/urn:li:share:1")).toBeNull();
    expect(posts.cleanPostUrl("javascript:alert(1)")).toBeNull();
    expect(posts.cleanPostUrl("https://www.linkedin.com/in/någon")).toBeNull();
    expect(posts.postId("https://www.linkedin.com/feed/update/urn:li:share:7123/")).toBe("urn:li:share:7123");
    expect(posts.postId("https://www.linkedin.com/posts/carl-fredrik_ledarskap-activity-7456-abcd")).toBe("urn:li:activity:7456");
  });

  it("tolkar LinkedIns datumformat som UTC", () => {
    expect(posts.parsePostDate("2026-10-05 08:12:33")).toBe("2026-10-05T08:12:33.000Z");
    expect(posts.parsePostDate("2026-10-05T08:12:33Z")).toBe("2026-10-05T08:12:33.000Z");
    expect(posts.parsePostDate("i går")).toBeNull();
  });
});

describe("Veckans hämtning", () => {
  it("hämtar statistik och personer för inlägg från de senaste 14 dagarna", async () => {
    const { calls, linkedin } = fakeWorld({
      shares: [share(101, 2), share(102, 9), share(103, 40)],
      totals: { "101": { total_reactions: 42, comments: 3, shares: 1 }, "102": { total_reactions: 7, comments: 0, shares: 0 } },
      likers: { "101": [person("Anna Andersson", "HR-chef på Sundsvalls kommun"), person("Bertil Berg", "VD på Exempel AB")], "102": [person("Anna Andersson", "HR-chef på Sundsvalls kommun")] },
      commenters: { "101": [person("Cecilia Ceder", "Utbildningsledare på Nackademin", { content: "Så bra skrivet!", datetime: "2026-10-10T09:00:00Z" })] },
    });
    const result = await eng.syncEngagement(store, { mode: "manual" });
    expect(result).toMatchObject({ ok: true, done: true, remaining: 0 });
    expect(result.message).toMatch(/Statistik hämtad för 2 inlägg \(6 poster från Apify\)/);
    expect(linkedin[0]).toBe("MEMBER_SHARE_INFO:0");

    // Only the two recent posts were sent to Apify: totals, likers and commenters for each.
    expect(calls).toHaveLength(6);
    for (const c of calls) {
      expect(c.auth).toBe(`Bearer ${APIFY_TOKEN}`);
      expect(c.url).not.toContain(APIFY_TOKEN);
      expect(c.url).toMatch(/\/run-sync-get-dataset-items$/);
    }
    const likers = calls.find((c) => c.input.type === "likers")!;
    expect(likers.actor).toBe("scraping_solutions~linkedin-posts-engagers-likers-and-commenters-no-cookies");
    expect(likers.input).toEqual({ urls: ["https://www.linkedin.com/feed/update/urn:li:share:101/"], resultsLimit: 100, type: "likers" });
    expect(calls.find((c) => c.input.type === "commenters")!.input.resultsLimit).toBe(50);
    expect(calls.find((c) => c.actor === "apimaestro~linkedin-post-detail")!.input).toEqual({ post_urls: ["https://www.linkedin.com/feed/update/urn:li:share:101/"] });
    expect(JSON.stringify(calls)).not.toContain("urn:li:share:103");

    const view = await eng.engagementOverview(store, 30);
    expect(view.state).toBe("ready");
    expect(view.posts.map((p) => p.id)).toEqual(["urn:li:share:101", "urn:li:share:102"]);
    expect(view.posts[0]).toMatchObject({ text: "Inlägg nummer 101 om ledarskap", source: "linkedin", visibility: "MEMBER_NETWORK" });
    expect(view.posts[0].stats).toMatchObject({ reactions: 42, comments: 3, shares: 1, likersFetched: 2, commentersFetched: 1, error: null });
    expect(view.summary).toMatchObject({ posts: 2, reactions: 49, comments: 3, people: 3 });
    expect(view.summary.bySegment).toEqual({ yh: 1, public: 1, company: 1, ugl: 0, other: 0 });

    // Strongest signal first: the one who engaged with two posts, then the commenter, then a single like.
    expect(view.people.map((p) => p.name)).toEqual(["Anna Andersson", "Cecilia Ceder", "Bertil Berg"]);
    expect(view.people[1]).toMatchObject({ segment: "yh", title: "Utbildningsledare", company: "Nackademin", comments: 1, likes: 0, latestKind: "commenter", latestComment: "Så bra skrivet!", isNew: true });
    expect(view.people[0]).toMatchObject({ segment: "public", likes: 2, postIds: ["urn:li:share:101", "urn:li:share:102"], latestPostId: "urn:li:share:101", profileUrl: "https://www.linkedin.com/in/anna-andersson" });

    // 90 days also shows the old post, which has no statistics.
    const wide = await eng.engagementOverview(store, 90);
    expect(wide.posts).toHaveLength(3);
    expect(wide.posts[2].stats).toBeNull();
  });

  it("en ny hämtning lägger inte till dubbletter och bara nya personer märks som nya", async () => {
    const world: World = { shares: [share(101, 2)], totals: { "101": { total_reactions: 1, comments: 0, shares: 0 } }, likers: { "101": [person("Anna Andersson", "VD")] } };
    fakeWorld(world);
    await eng.syncEngagement(store, { mode: "manual" });
    const first = (await eng.engagementOverview(store)).people[0].firstSeenAt;
    await longAgo();
    await new Promise((r) => setTimeout(r, 5));
    world.likers!["101"].push(person("Bertil Berg", "Teamledare"));
    world.totals!["101"].total_reactions = 2;
    await eng.syncEngagement(store, { mode: "manual" });
    const view = await eng.engagementOverview(store);
    expect(view.people).toHaveLength(2);
    expect(view.people.find((p) => p.name === "Anna Andersson")).toMatchObject({ likes: 1, isNew: false, firstSeenAt: first });
    expect(view.people.find((p) => p.name === "Bertil Berg")).toMatchObject({ isNew: true, segment: "ugl" });
    expect(view.posts[0].stats).toMatchObject({ reactions: 2, likersFetched: 2 });
  });

  it("personer som finns bland de hämtade kontakterna märks som kontakt", async () => {
    await store.setKV("me", "linkedin_contacts", { contacts: [{ id: "li:linkedin.com/in/anna-andersson", name: "Anna Andersson", title: null, company: null, connectedOn: null, profileUrl: null, source: "linkedin", firstSeenAt: "2026-01-01T00:00:00.000Z" }] });
    fakeWorld({ shares: [share(101, 2)], likers: { "101": [person("Anna Andersson", "VD"), person("Bertil Berg", "VD")] } });
    await eng.syncEngagement(store, { mode: "manual" });
    const people = (await eng.engagementOverview(store)).people;
    expect(people.find((p) => p.name === "Anna Andersson")?.isContact).toBe(true);
    expect(people.find((p) => p.name === "Bertil Berg")?.isContact).toBe(false);
  });

  it("görs automatiskt högst en gång per vecka", async () => {
    const { calls } = fakeWorld({ shares: [share(101, 2)], totals: { "101": { total_reactions: 1, comments: 0, shares: 0 } }, likers: { "101": [person("Anna Andersson", "VD")] } });
    expect(eng.autoDue(await eng.loadEngagementState(store))).toBe(true);
    expect(await eng.syncEngagement(store, { mode: "auto" })).toMatchObject({ ok: true, done: true });
    const after = calls.length;
    expect(await eng.syncEngagement(store, { mode: "auto" })).toMatchObject({ ok: true, skipped: true });
    expect(calls).toHaveLength(after);

    const state = await eng.loadEngagementState(store);
    const monday = new Date(2026, 9, 12, 8, 0);
    const done = { ...state, lastAutoWeek: eng.weekKey(monday), lastAutoDay: "2026-10-12" };
    expect(eng.weekKey(monday)).toBe("2026-W42");
    expect(eng.autoDue(done, new Date(2026, 9, 18, 23, 0))).toBe(false); // Sunday the same week
    expect(eng.autoDue(done, new Date(2026, 9, 19, 6, 0))).toBe(true); // Monday the week after
  });

  it("en misslyckad veckohämtning räknas inte som gjord, men försöks bara en gång per dag", async () => {
    fakeWorld({ shares: [share(101, 2)], apifyStatus: 500 });
    const result = await eng.syncEngagement(store, { mode: "auto" });
    expect(result.ok).toBe(false);
    const state = await eng.loadEngagementState(store);
    expect(state.lastAutoWeek).toBeNull();
    expect(state.lastError).toMatch(/Apify svarar inte just nu/);
    expect(eng.autoDue(state)).toBe(false);
    const tomorrow = new Date(Date.now() + DAY);
    expect(eng.autoDue(state, new Date(tomorrow.toLocaleString("en-US", { timeZone: envMod.env.timeZone })))).toBe(true);
    // The post shows the error and keeps working when Apify is back.
    expect((await eng.engagementOverview(store)).posts[0].stats?.error).toMatch(/Apify svarar inte/);
  });

  it("väntar när en annan hämtning är mitt i ett inlägg", async () => {
    const { calls } = fakeWorld({ shares: [share(101, 2)] });
    await store.setKV("me", "linkedin_engagement_state", {
      job: { startedAt: new Date().toISOString(), mode: "manual", queue: ["urn:li:share:101"], total: 1, records: 0, failed: 0, busyUntil: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(await eng.syncEngagement(store, { mode: "manual" })).toMatchObject({ done: false, busy: true, skipped: true, remaining: 1 });
    expect(calls).toHaveLength(0);
    expect((await eng.engagementOverview(store)).running).toEqual({ total: 1, remaining: 1 });
  });

  it("fortsätter en avbruten hämtning där den slutade", async () => {
    const { calls } = fakeWorld({ shares: [share(101, 2), share(102, 3)], likers: { "102": [person("Anna Andersson", "VD")] } });
    await eng.addManualPost(store, shareLink(101));
    await eng.addManualPost(store, shareLink(102));
    await store.setKV("me", "linkedin_engagement_state", {
      lastRunAt: new Date().toISOString(),
      job: { startedAt: new Date().toISOString(), mode: "auto", queue: ["urn:li:share:102"], total: 2, records: 5, failed: 0, busyUntil: new Date(Date.now() - 1000).toISOString() },
    });
    const result = await eng.syncEngagement(store, { mode: "auto" });
    expect(result).toMatchObject({ ok: true, done: true });
    expect(result.message).toMatch(/2 inlägg \(6 poster/);
    expect(calls.every((c) => JSON.stringify(c.input).includes(":102/"))).toBe(true);
    const state = await eng.loadEngagementState(store);
    expect(state.job).toBeNull();
    expect(state.lastAutoWeek).not.toBeNull();
  });
});

describe("När LinkedIns lista inte räcker", () => {
  it("ett inlägg kan läggas till med länk och hämtas direkt", async () => {
    const { calls } = fakeWorld({ shares: [], totals: { "555": { total_reactions: 9, comments: 1, shares: 0 } }, likers: { "555": [person("Anna Andersson", "VD")] } });
    expect(await eng.addManualPost(store, "https://example.com/inte-linkedin")).toBeNull();
    const post = await eng.addManualPost(store, "https://www.linkedin.com/posts/carl-fredrik_ledarskap-activity-555-abcd?utm_source=share");
    expect(post).toMatchObject({ id: "urn:li:activity:555", source: "manual", text: null });
    // Adding the same link twice gives the same post.
    expect((await eng.addManualPost(store, "https://www.linkedin.com/posts/carl-fredrik_ledarskap-activity-555-abcd"))?.id).toBe(post!.id);

    const result = await eng.syncEngagement(store, { mode: "manual", postId: post!.id });
    expect(result).toMatchObject({ ok: true, done: true });
    expect(calls).toHaveLength(3);
    const [stored] = (await eng.engagementOverview(store)).posts;
    // Text and date come from Apify when LinkedIn's list did not have the post.
    expect(stored).toMatchObject({ text: "Text för 555", source: "manual" });
    expect(stored.publishedAt).not.toBeNull();
    expect(stored.stats).toMatchObject({ reactions: 9, likersFetched: 1 });
    expect(await eng.syncEngagement(store, { mode: "manual", postId: "finns-inte" })).toMatchObject({ ok: false });
  });

  it("säger till när LinkedIns lista inte är klar, och räknar då inte veckan som gjord", async () => {
    fakeWorld({ shares: [] });
    const result = await eng.syncEngagement(store, { mode: "auto" });
    expect(result).toMatchObject({ ok: true, done: true });
    expect(result.message).toMatch(/inte listan över dina inlägg klar än/);
    const state = await eng.loadEngagementState(store);
    expect(state.lastAutoWeek).toBeNull();
    expect((await eng.engagementOverview(store)).notice).toMatch(/Lägg till inlägg genom att klistra in länken/);
  });

  it("ett fel från LinkedIn stoppar inte hämtningen för inlägg som redan finns", async () => {
    await eng.addManualPost(store, shareLink(101));
    const { calls } = fakeWorld({ linkedinStatus: 401, likers: { "101": [person("Anna Andersson", "VD")] } });
    const result = await eng.syncEngagement(store, { mode: "manual" });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(3);
    const view = await eng.engagementOverview(store);
    expect(view.notice).toMatch(/kunde inte uppdateras från LinkedIn/);
    expect(view.people).toHaveLength(1);
  });

  it("okända fältnamn för inlägg sparar inget och listar fälten", async () => {
    fakeWorld({ shares: [{ Kolumn1: "2026-10-05", Kolumn2: "text" }] });
    const result = await eng.syncEngagement(store, { mode: "manual" });
    expect(result.message).toMatch(/känner inte igen fältet med länken.*Fält för inlägg från LinkedIn: Kolumn1, Kolumn2\./);
    expect(await eng.loadPosts(store)).toEqual([]);
  });
});

describe("Fel från Apify", () => {
  it("avvisad token stoppar körningen och försöks inte igen automatiskt", async () => {
    const { calls } = fakeWorld({ shares: [share(101, 2), share(102, 3)], apifyStatus: 401 });
    const result = await eng.syncEngagement(store, { mode: "manual" });
    expect(result).toMatchObject({ ok: false, done: true });
    expect(result.message).toMatch(/Apify godkänner inte token.*APIFY_TOKEN/);
    // The run stops after the first post instead of spending calls on the rest.
    expect(calls).toHaveLength(3);
    const state = await eng.loadEngagementState(store);
    expect(state).toMatchObject({ apifyRejected: true, job: null });
    expect(eng.autoDue(state)).toBe(false);
    expect((await eng.engagementOverview(store)).lastError).toMatch(/Apify godkänner inte token/);
  });

  it("slut på kredit ger ett begripligt besked", async () => {
    fakeWorld({ shares: [share(101, 2)], apifyStatus: 402 });
    const result = await eng.syncEngagement(store, { mode: "manual" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Apify-krediten är slut/);
  });

  it("ett svar i okänt format sparar inga personer och listar fältnamnen utan värden", async () => {
    fakeWorld({ shares: [share(101, 2)], likers: { "101": [{ kolumnA: "Anna Andersson", kolumnB: "VD" }] } });
    const result = await eng.syncEngagement(store, { mode: "manual" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/känner inte igen namnfältet.*Fält från Apify: kolumnA, kolumnB\./);
    expect(result.message).not.toContain("Anna");
    expect((await eng.engagementOverview(store)).people).toEqual([]);
  });

  it("andra skrivsätt av samma fält känns igen, även när personen ligger nästlad", () => {
    const now = "2026-10-12T00:00:00.000Z";
    expect(eng.toEngager({ author: { fullName: "Anna Andersson", headline: "VD på Exempel AB", profile_url: "linkedin.com/in/anna/" }, text: "Hej" }, "commenter", now)).toMatchObject({
      name: "Anna Andersson",
      title: "VD",
      company: "Exempel AB",
      profileUrl: "https://linkedin.com/in/anna",
      comment: "Hej",
      segment: "company",
    });
    // A link that is not LinkedIn never becomes a link in Navet.
    expect(eng.toEngager({ name: "Bertil", url_profile: "javascript:alert(1)" }, "liker", now)).toMatchObject({ profileUrl: null, comment: null });
    expect(eng.toEngager({ subtitle: "VD" }, "liker", now)).toBeNull();
  });
});

describe("Inställningar och skydd", () => {
  it("utan APIFY_TOKEN hämtas och visas ingenting", async () => {
    envMod.env.apifyToken = null;
    const { calls, linkedin } = fakeWorld({ shares: [share(101, 2)] });
    expect(await eng.syncEngagement(store, { mode: "manual" })).toMatchObject({ ok: false });
    const view = await eng.engagementOverview(store);
    expect(view).toMatchObject({ state: "not_configured", posts: [], people: [], autoDue: false, linkedinPosts: true });
    expect(calls).toHaveLength(0);
    expect(linkedin).toHaveLength(0);
    const li = (await status.integrationStatuses(store, "https://navet.example"))[2];
    expect(li.capabilities.find((c) => c.id === "linkedin.engagers")).toMatchObject({ status: "needs_permission", effect: "read" });
    expect(li.capabilities.find((c) => c.id === "linkedin.engagers")?.note).toMatch(/tredjepartstjänsten Apify.*Kräver APIFY_TOKEN/);
  });

  it("på en publik adress utan lösenord är allt avstängt", async () => {
    process.env.VERCEL = "1";
    const { calls } = fakeWorld({ shares: [share(101, 2)] });
    expect(await eng.syncEngagement(store, { mode: "manual" })).toMatchObject({ ok: false });
    expect((await eng.engagementOverview(store)).state).toBe("locked");
    expect(calls).toHaveLength(0);
  });

  it("kortet säger att personerna kommer från en tredjepartstjänst", async () => {
    fakeWorld({});
    const li = (await status.integrationStatuses(store, "https://navet.example"))[2];
    expect(li.capabilities.find((c) => c.id === "linkedin.engagers")).toMatchObject({ status: "active" });
    expect(li.capabilities.find((c) => c.id === "linkedin.engagers")?.note).toMatch(/Finns inte i LinkedIns API.*Apify/);
    expect(li.capabilities.find((c) => c.id === "linkedin.posts")).toMatchObject({ status: "active", effect: "read" });
  });

  it("ingen av nycklarna lämnar servern: inte i svar, sparad data eller loggar", async () => {
    const logs: unknown[] = [];
    vi.spyOn(console, "info").mockImplementation((...a) => void logs.push(a));
    vi.spyOn(console, "error").mockImplementation((...a) => void logs.push(a));
    fakeWorld({ shares: [share(101, 2)], likers: { "101": [person("Anna Andersson", "VD")] } });
    const out = [await eng.syncEngagement(store, { mode: "manual" }), await eng.engagementOverview(store)];
    const stored = [await store.getKV("me", "linkedin_engagement_state"), await store.getKV("me", "linkedin_posts"), await store.getKV("me", "linkedin_engagers:urn:li:share:101")];
    const all = JSON.stringify([out, stored, logs]);
    expect(all).not.toContain(APIFY_TOKEN.slice(0, 16));
    expect(all).not.toContain(LI_TOKEN.slice(0, 12));
    // Field names are logged once, never names or comments.
    expect(JSON.stringify(logs)).toContain("apify engagers fält: name, subtitle, url_profile");
    expect(JSON.stringify(logs)).not.toContain("Anna");
  });

  it("ett felklistrat APIFY_TOKEN känns igen på formen", async () => {
    envMod.env.apifyToken = `"${APIFY_TOKEN}"`;
    expect((await eng.engagementOverview(store)).configWarning).toMatch(/citattecken/);
    envMod.env.apifyToken = `Bearer ${APIFY_TOKEN}`;
    expect(eng.apifyConfigWarning()).toMatch(/Bearer/);
    envMod.env.apifyToken = APIFY_TOKEN;
    expect(eng.apifyConfigWarning()).toBeNull();
  });
});

describe("Från person till uppföljning", () => {
  it("skapar en uppgift i inkorgen med sammanhang och förslag på öppning", async () => {
    fakeWorld({ shares: [share(101, 2, "Tre saker nya chefer underskattar")], commenters: { "101": [person("Cecilia Ceder", "HR-chef på Exempel AB", { content: "Känner igen mig!" })] } });
    await eng.syncEngagement(store, { mode: "manual" });
    const view = await eng.engagementOverview(store);
    const [p] = view.people;
    const item = leads.personToItem(p, view.posts[0]);
    expect(item).toMatchObject({ title: "Hör av dig till Cecilia Ceder", type: "task", status: "inbox", source: "manual", person: "Cecilia Ceder" });
    expect(item.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(item.description).toContain("Kommenterade ditt inlägg ”Tre saker nya chefer underskattar”");
    expect(item.description).toContain("Målgrupp: Företagskund");
    expect(item.description).toContain("Kommentar: ”Känner igen mig!”");
    expect(item.description).toContain("Profil: https://www.linkedin.com/in/cecilia-ceder");
    expect(item.description).toContain("Hej Cecilia! Tack för att du kommenterade mitt inlägg om ”Tre saker nya chefer underskattar”.");
    expect(item.description).not.toContain("—");

    const asItem = { ...item, id: "x", createdAt: "", updatedAt: "" } as unknown as import("../../types").NavetItem;
    expect(leads.personInNavet(p, [asItem])).toBe(true);
    expect(leads.personInNavet({ ...p, id: "li:linkedin.com/in/annan" }, [asItem])).toBe(false);
  });
});
