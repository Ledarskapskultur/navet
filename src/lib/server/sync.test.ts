import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));

let NavetService: typeof import("./service").NavetService;
let getStore: typeof import("./store").getStore;
let MockTasksProvider: typeof import("../integrations/google/mock-tasks").MockTasksProvider;

beforeAll(async () => {
  process.env.NAVET_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "navet-test-"));
  ({ NavetService } = await import("./service"));
  ({ getStore } = await import("./store"));
  ({ MockTasksProvider } = await import("../integrations/google/mock-tasks"));
});

const ctx = { mode: "demo" as const, userId: "demo" as const, session: null };

describe("Google Tasks sync (demo provider)", () => {
  it("imports new tasks to inbox, applies Google-side edits and handles deletions", async () => {
    const svc = await NavetService.create(ctx);
    const first = await svc.syncGoogle();
    expect(first.imported).toBeGreaterThan(0);

    const items = await svc.listItems();
    const brev = items.find((i) => i.title === "Skicka brevet till Anna")!;
    expect(brev).toMatchObject({ status: "inbox", source: "google_tasks", externalListId: "list-default", person: "Anna" });

    // A second sync without changes is a no-op
    expect((await svc.syncGoogle()).updated).toBe(0);

    // Change in Google: complete + rename
    const google = new MockTasksProvider(await getStore(), "demo");
    await new Promise((r) => setTimeout(r, 5));
    await google.patchTask("list-default", brev.externalId!, { title: "Skicka brevet till Anna Andersson", status: "completed" });
    const second = await svc.syncGoogle();
    expect(second.updated).toBe(1);
    const after = (await svc.listItems()).find((i) => i.id === brev.id)!;
    expect(after).toMatchObject({ title: "Skicka brevet till Anna Andersson", status: "done" });

    // Deleted in Google → archived & unlinked in Navet
    await google.deleteTask("list-default", brev.externalId!);
    expect((await svc.syncGoogle()).removed).toBe(1);
    const gone = (await svc.listItems()).find((i) => i.id === brev.id)!;
    expect(gone.externalId).toBeNull();
  });

  it("pushes Navet edits to Google and moves between lists", async () => {
    const svc = await NavetService.create(ctx);
    const item = await svc.createItem({ title: "Testuppgift", dueDate: "2026-11-01" }, { syncToGoogle: true, listId: "list-jobb" });
    expect(item.externalListId).toBe("list-jobb");
    await svc.updateItem(item.id, { title: "Testuppgift 2", status: "done", externalListId: "list-privat" });
    const google = new MockTasksProvider(await getStore(), "demo");
    const moved = (await google.listTasks("list-privat")).find((t) => t.id === item.externalId)!;
    expect(moved).toMatchObject({ title: "Testuppgift 2", status: "completed" });
    expect((await google.listTasks("list-jobb")).some((t) => t.id === item.externalId)).toBe(false);
    expect((await svc.syncGoogle()).updated).toBe(0);
  });
});

describe("personal mode (no Google)", () => {
  const me = { mode: "personal" as const, userId: "me" as const, session: null };

  it("works without any Google provider", async () => {
    const svc = await NavetService.create(me);
    expect((await svc.listProjects()).map((p) => p.name)).toContain("Trolleri & DJ");
    const welcome = await svc.listItems();
    expect(welcome).toHaveLength(1);

    const item = await svc.createItem({ title: "Ring Johan", dueDate: "2026-10-08" }, { syncToGoogle: true });
    expect(item.externalId).toBeNull();
    const done = await svc.updateItem(item.id, { status: "done", title: "Ring Johan om avtalet" });
    expect(done).toMatchObject({ status: "done", title: "Ring Johan om avtalet" });
    expect(await svc.syncGoogle()).toMatchObject({ imported: 0, updated: 0, removed: 0 });
    expect(await svc.listGoogleLists()).toEqual([]);
    await svc.deleteItem(item.id);
    expect((await svc.listItems()).some((i) => i.id === item.id)).toBe(false);
  });
});
