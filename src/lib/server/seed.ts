import "server-only";
import { randomUUID } from "node:crypto";
import { addDays, nextDay } from "date-fns";
import { toISODate } from "../dates";
import type { NavetItem, Project } from "../types";
import type { MockGoogleData } from "../integrations/google/mock-tasks";
import type { GoogleTask } from "../integrations/google/types";

export function seedProjects(now = new Date()): Project[] {
  const ts = now.toISOString();
  const p = (id: string, name: string, aliases: string[], color: string, description: string): Project => ({
    id, name, aliases, color, description, archived: false, createdAt: ts, updatedAt: ts,
  });
  return [
    p("p-ugl", "UGL Sverige", ["ugl"], "#2F5D4E", "Kursveckor, handledning och kunddialog kring UGL."),
    p("p-lm", "Ledarskapsmetoden", ["ledarskapsmetoden", "metoden"], "#7A6A4F", "Utveckling och leverans av Ledarskapsmetoden."),
    p("p-yh", "YH / undervisning", ["yh", "undervisning", "lektion", "kursen"], "#4F6A7A", "Undervisning, rättning och studenter."),
    p("p-ftg", "Företaget", ["företaget", "firman", "bolaget", "faktura"], "#5E5A7A", "Administration, ekonomi och försäljning."),
    p("p-priv", "Privat", ["privat", "hemma"], "#8A5A5A", "Allt utanför jobbet."),
  ];
}

export function newItem(partial: Partial<NavetItem> & { title: string }, now = new Date()): NavetItem {
  const ts = now.toISOString();
  return {
    id: randomUUID(),
    description: null,
    type: "task",
    status: "open",
    source: "manual",
    projectId: null,
    dueDate: null,
    dueTime: null,
    priority: "normal",
    estimatedTime: null,
    waitingFor: null,
    person: null,
    lastFollowUp: null,
    externalId: null,
    externalProvider: null,
    externalListId: null,
    externalUpdatedAt: null,
    completedAt: null,
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  };
}

export function seedDemoItems(now = new Date()): NavetItem[] {
  const d = (n: number) => toISODate(addDays(now, n));
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000).toISOString();
  const tuesday = toISODate(nextDay(now, 2));
  const items: Partial<NavetItem>[] = [
    // Inkorg
    { title: "Kolla upp lokal för UGL i mars", status: "inbox", createdAt: ago(2) },
    { title: "Podcast om vardagsledarskap", type: "idea", status: "inbox", source: "voice", createdAt: ago(5) },
    // Att göra
    { title: "Förbered lektion om feedback", projectId: "p-yh", dueDate: d(0), dueTime: "08:30", priority: "high", estimatedTime: 60, createdAt: ago(30) },
    { title: "Skicka faktura till Nordbolaget", projectId: "p-ftg", dueDate: d(-2), priority: "high", estimatedTime: 15, createdAt: ago(80) },
    { title: "Svara på enkät från YH-myndigheten", projectId: "p-yh", dueDate: d(-1), estimatedTime: 20, createdAt: ago(60) },
    { title: "Uppdatera kursmaterial dag 3", projectId: "p-lm", dueDate: d(3), estimatedTime: 90, createdAt: ago(40) },
    { title: "Läs in nya UGL-handboken", projectId: "p-ugl", dueDate: d(7), priority: "low", createdAt: ago(100) },
    { title: "Boka tandläkare", projectId: "p-priv", createdAt: ago(120) },
    { title: "Ringa mamma", type: "reminder", projectId: "p-priv", dueDate: d(0), dueTime: "18:00", createdAt: ago(10) },
    // Åtaganden
    { title: "Skicka presentationen", type: "commitment", person: "Martin", projectId: "p-ugl", dueDate: tuesday, priority: "high", createdAt: ago(26) },
    { title: "Ge feedback på Lisas utkast", type: "commitment", person: "Lisa", projectId: "p-yh", dueDate: d(1), createdAt: ago(48) },
    // Väntar på
    { title: "Signerat avtal", type: "waiting", status: "waiting", waitingFor: "Anna Andersson", projectId: "p-ugl", dueDate: d(2), lastFollowUp: d(-3), createdAt: ago(200) },
    { title: "Bekräftelse på lokal", type: "waiting", status: "waiting", waitingFor: "Konferensgården", projectId: "p-lm", lastFollowUp: d(-6), createdAt: ago(300) },
    // Idéer
    { title: "En sida för HR om UGL", type: "idea", projectId: "p-ugl", createdAt: ago(70) },
    { title: "Mikrokurs i feedback för chefer", type: "idea", projectId: "p-lm", createdAt: ago(150) },
    { title: "Digital uppföljning tre månader efter kursveckan", type: "idea", projectId: "p-ugl", createdAt: ago(20) },
    // Anteckningar
    { title: "Kursutvärdering: deltagarna vill ha mer praktiska övningar", type: "note", projectId: "p-yh", createdAt: ago(90) },
    // Klart
    { title: "Skicka kallelse till UGL v.44", status: "done", projectId: "p-ugl", completedAt: ago(20), createdAt: ago(240) },
  ];
  return items.map((p) => newItem({ ...(p as NavetItem), updatedAt: p.createdAt ?? now.toISOString() }, now));
}

export function seedMockGoogle(now = new Date()): MockGoogleData {
  const due = (n: number) => `${toISODate(addDays(now, n))}T00:00:00.000Z`;
  const ts = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
  const t = (id: string, title: string, opts: Partial<GoogleTask> = {}): GoogleTask => ({
    id, title, status: "needsAction", updated: ts(1), ...opts,
  });
  return {
    lists: [
      { id: "list-default", title: "Mina uppgifter" },
      { id: "list-jobb", title: "Jobb" },
      { id: "list-privat", title: "Privat" },
    ],
    tasks: {
      "list-default": [
        t("mock-brev", "Skicka brevet till Anna", { due: due(0), updated: ts(0.5) }),
        t("mock-hotell", "Boka hotell för UGL i november", { updated: ts(3) }),
        t("mock-present", "Köpa present till Elsa", { due: due(2), updated: ts(6) }),
      ],
      "list-jobb": [
        t("mock-ratta", "Rätta inlämningar YH", { due: due(1), updated: ts(12) }),
        t("mock-johan", "Ring Johan om samarbetet", { due: `${toISODate(nextDay(now, 4))}T00:00:00.000Z`, updated: ts(14) }),
      ],
      "list-privat": [
        t("mock-dack", "Byta till vinterdäck", { due: due(5), updated: ts(30) }),
        t("mock-el", "Betala elräkningen", { status: "completed", completed: ts(8), updated: ts(8) }),
      ],
    },
  };
}
