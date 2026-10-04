import { describe, expect, it } from "vitest";
import { parseCapture } from "./parser";
import type { Project } from "./types";

const now = new Date(2026, 9, 5, 9, 0); // Monday 5 Oct 2026
const p = (id: string, name: string, aliases: string[]): Project => ({
  id, name, aliases, description: null, color: "#000", archived: false, createdAt: "", updatedAt: "",
});
const projects = [
  p("ugl", "UGL Sverige", ["ugl"]),
  p("yh", "YH / undervisning", ["yh", "undervisning"]),
  p("priv", "Privat", ["privat"]),
];

describe("parseCapture", () => {
  it("task with weekday and person", () => {
    const r = parseCapture("Ring Johan på torsdag", projects, now);
    expect(r).toMatchObject({ type: "task", title: "Ring Johan", dueDate: "2026-10-08", person: "Johan" });
  });

  it("idea with project", () => {
    const r = parseCapture("Idé till UGL: gör en sida för HR", projects, now);
    expect(r).toMatchObject({ type: "idea", title: "Gör en sida för HR", projectId: "ugl" });
  });

  it("commitment", () => {
    const r = parseCapture("Jag lovade Anna att skicka presentationen på fredag", projects, now);
    expect(r).toMatchObject({ type: "commitment", title: "Skicka presentationen", person: "Anna", dueDate: "2026-10-09" });
  });

  it("waiting", () => {
    const r = parseCapture("Väntar på Martin ska skicka avtalet", projects, now);
    expect(r).toMatchObject({ type: "waiting", waitingFor: "Martin", title: "Skicka avtalet" });
  });

  it("waiting with från", () => {
    const r = parseCapture("Väntar på svar från Lisa om kursdatum", projects, now);
    expect(r).toMatchObject({ type: "waiting", waitingFor: "Lisa" });
  });

  it("reminder today", () => {
    const r = parseCapture("Påminn mig att skicka brevet till Anna idag", projects, now);
    expect(r).toMatchObject({ type: "reminder", title: "Skicka brevet till Anna", dueDate: "2026-10-05", person: "Anna" });
  });

  it("time and tomorrow", () => {
    const r = parseCapture("Möte med rektor imorgon kl 14", projects, now);
    expect(r).toMatchObject({ dueDate: "2026-10-06", dueTime: "14:00", title: "Möte med rektor" });
  });

  it("priority and explicit date", () => {
    const r = parseCapture("Viktigt: betala fakturan 12 okt", projects, now);
    expect(r).toMatchObject({ priority: "high", dueDate: "2026-10-12", title: "Betala fakturan" });
  });

  it("nästa fredag", () => {
    expect(parseCapture("Lunch nästa fredag", projects, now).dueDate).toBe("2026-10-16");
  });

  it("note", () => {
    expect(parseCapture("Anteckning: Kursen går bra", projects, now)).toMatchObject({ type: "note", title: "Kursen går bra" });
  });

  it("project alias inside sentence", () => {
    expect(parseCapture("Rätta inlämningar i YH", projects, now).projectId).toBe("yh");
  });
});

import { interpretMail } from "./mail-interpret";

describe("interpretMail", () => {
  it("offert från Anna", () => {
    const r = interpretMail(
      {
        id: "1",
        from: "Anna Andersson",
        fromEmail: "a@x.se",
        subject: "Kan du skicka offert senast fredag?",
        preview: "Vi vill gå vidare med UGL för vår ledningsgrupp.",
        receivedAt: "",
        source: "demo",
      },
      projects,
      now,
    );
    expect(r).toMatchObject({ type: "task", title: "Skicka offert till Anna", deadlineText: "Fredag", projectId: "ugl", dueDate: "2026-10-09" });
  });
});
