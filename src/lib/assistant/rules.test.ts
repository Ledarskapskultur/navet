import { describe, expect, it } from "vitest";
import { interpret } from "./rules";
import type { NavetItem, Project } from "../types";

const now = new Date(2026, 9, 5, 9, 0); // Monday 5 Oct 2026
let n = 0;
const item = (p: Partial<NavetItem>): NavetItem => ({
  id: `i${++n}`, title: "x", description: null, type: "task", status: "open", source: "manual", projectId: null,
  dueDate: null, dueTime: null, priority: "normal", estimatedTime: null, waitingFor: null, person: null,
  lastFollowUp: null, stage: null, contact: null, eventDate: null, origin: null, externalId: null,
  externalProvider: null, externalListId: null, externalUpdatedAt: null, completedAt: null,
  createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", ...p,
});
const projects: Project[] = [
  { id: "p-ugl", name: "UGL Sverige", aliases: ["ugl"], description: null, color: "#000", archived: false, createdAt: "", updatedAt: "" },
];
const items = [
  item({ title: "Ring Johan", dueDate: "2026-10-05" }),
  item({ title: "Skicka faktura", dueDate: "2026-10-02", projectId: "p-ugl" }),
  item({ title: "Rätta inlämningar", dueDate: "2026-10-06" }),
  item({ title: "Ring Johanna", dueDate: "2026-10-09" }),
  item({ title: "Skicka presentationen", type: "commitment", person: "Martin", dueDate: "2026-10-06" }),
  item({ title: "Signerat avtal", type: "waiting", status: "waiting", waitingFor: "Anna" }),
  item({ title: "Företagsintern UGL – Exempel AB", type: "request", status: "inbox", stage: "new", projectId: "p-ugl" }),
  item({ title: "Gammal klar", status: "done", dueDate: "2026-10-05" }),
];
const ctx = { items, projects, now };
const ask = (t: string) => interpret(t, ctx);

describe("assistant rules", () => {
  it("today", () => {
    const r = ask("Vad har jag idag?");
    expect(r?.kind).toBe("answer");
    expect(r && "speech" in r && r.speech).toMatch(/Idag har du en sak: Ring Johan\./);
    expect(r && "speech" in r && r.speech).toMatch(/försenad sak: Skicka faktura, försenad sedan den 2 oktober/);
    expect(r && "speech" in r && r.speech).toMatch(/en ny förfrågan/);
  });

  it("tomorrow, week, overdue", () => {
    expect(ask("vad har jag imorgon")).toMatchObject({ speech: expect.stringContaining("Rätta inlämningar") });
    expect(ask("Vad har jag i veckan?")).toMatchObject({ speech: expect.stringContaining("Ring Johanna på fredag") });
    expect(ask("Vad är försenat?")).toMatchObject({ speech: expect.stringContaining("Skicka faktura") });
  });

  it("requests, waiting, commitments, project", () => {
    expect(ask("Vilka förfrågningar har jag?")).toMatchObject({ speech: expect.stringContaining("en ny förfrågan") });
    expect(ask("Vad väntar jag på?")).toMatchObject({ speech: expect.stringContaining("Anna: Signerat avtal") });
    expect(ask("Vad har jag lovat Martin?")).toMatchObject({ speech: expect.stringContaining("till Martin") });
    expect(ask("Vad händer i UGL?")).toMatchObject({ title: "UGL Sverige" });
  });

  it("navigation and stop", () => {
    expect(ask("Visa inkorgen")).toMatchObject({ kind: "navigate", href: "/inkorg" });
    expect(ask("öppna förfrågningar")).toMatchObject({ kind: "navigate", href: "/forfragningar" });
    expect(ask("Nej tack")).toMatchObject({ kind: "stop" });
  });

  it("complete with exact match, and asks when ambiguous", () => {
    expect(ask("Markera ring Johan som klar")).toMatchObject({ kind: "complete", item: { title: "Ring Johan" } });
    expect(ask("Skicka faktura är klar")).toMatchObject({ kind: "complete", item: { title: "Skicka faktura" } });
    expect(ask("Bocka av ring")).toMatchObject({ kind: "clarify" });
    expect(ask("Markera tvätta bilen som klar")).toMatchObject({ kind: "answer", title: "Hittade inget" });
  });

  it("everything else is captured", () => {
    expect(ask("Ring Johan på torsdag")).toBeNull();
    expect(ask("Väntar på Martin ska skicka avtalet")).toBeNull();
    expect(ask("Jag lovade Anna att skicka offerten")).toBeNull();
    expect(ask("Idé till UGL: gör en sida för HR")).toBeNull();
  });
});
