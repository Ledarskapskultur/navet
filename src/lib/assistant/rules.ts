// Rule-based voice/text assistant: answers fixed questions about what's in Navet and
// performs a few simple actions. It returns the same Reply shape an AI assistant will
// return later, so the UI doesn't need to change when Claude is plugged in.
import { addDays, format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { daysFromToday, toISODate } from "../dates";
import { findProject } from "../parser";
import { byDue, isActionable, isActive, isOverdue } from "../selectors";
import type { NavetItem, Project } from "../types";

export type Reply =
  /** Spoken/shown answer to a question */
  | { kind: "answer"; speech: string; items: NavetItem[]; title: string }
  /** Open a page in Navet */
  | { kind: "navigate"; speech: string; href: string }
  /** Mark an item as done */
  | { kind: "complete"; speech: string; item: NavetItem }
  /** Several candidates – ask the user to be more specific */
  | { kind: "clarify"; speech: string; items: NavetItem[]; title: string }
  /** End the conversation */
  | { kind: "stop"; speech: string };

export interface AssistantContext {
  items: NavetItem[];
  projects: Project[];
  now?: Date;
}

const MAX_SPOKEN = 5;

export const HELP_TEXT =
  "Du kan fråga: vad har jag idag, vad har jag imorgon, vad har jag i veckan, vad är försenat, " +
  "vilka förfrågningar har jag, vad väntar jag på, vad har jag lovat, eller vad händer i UGL. " +
  "Du kan säga: visa inkorgen, eller markera ring Johan som klar. Allt annat sparas som en ny sak.";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[?!.,]/g, " ")
    .replace(/^\s*(hej\s+)?navet\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const QUESTION = /^(vad|vilka|vilken|vem|hur|när|finns det|har jag|kan du berätta|berätta|läs upp)\b/;

/** Natural spoken date: "idag", "imorgon", "på torsdag", "den 15 mars". */
export function spokenDate(iso: string, now = new Date()): string {
  const d = daysFromToday(iso, now);
  if (d === 0) return "idag";
  if (d === 1) return "imorgon";
  if (d === -1) return "igår";
  if (d > 1 && d < 7) return `på ${format(parseISO(iso), "EEEE", { locale: sv })}`;
  return `den ${format(parseISO(iso), "d MMMM", { locale: sv })}`;
}

function describe(item: NavetItem, now: Date, withDate = true): string {
  let s = item.title;
  if (item.type === "request" && item.contact?.name && !s.includes(item.contact.name)) s += ` från ${item.contact.name}`;
  if (item.type === "waiting" && item.waitingFor) s = `${item.waitingFor}: ${item.title}`;
  if (item.type === "commitment" && item.person) s += ` till ${item.person}`;
  if (withDate && item.dueDate) {
    s += isOverdue(item, toISODate(now)) ? `, försenad sedan ${spokenDate(item.dueDate, now)}` : ` ${spokenDate(item.dueDate, now)}`;
  }
  if (item.dueTime && item.dueDate === toISODate(now)) s += ` klockan ${item.dueTime}`;
  return s;
}

function list(items: NavetItem[], now: Date, withDate = true): string {
  const shown = items.slice(0, MAX_SPOKEN).map((i) => describe(i, now, withDate));
  const rest = items.length - shown.length;
  if (rest > 0) shown.push(`och ${rest} till`);
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} och ${shown[shown.length - 1]}`.replace(" och och ", " och ");
}

function count(n: number, one: string, many: string) {
  const words = ["inga", "en", "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio", "tio"];
  return `${words[n] ?? n} ${n === 1 ? one : many}`;
}

const PAGES: [RegExp, string, string][] = [
  [/inkorg/, "/inkorg", "inkorgen"],
  [/förfrågningar|förfrågan|bokningar/, "/forfragningar", "förfrågningarna"],
  [/att göra|uppgifter/, "/att-gora", "att göra"],
  [/väntar på/, "/vantar-pa", "väntar på"],
  [/åtaganden|löften/, "/ataganden", "åtagandena"],
  [/idéer|idé/, "/ideer", "idéerna"],
  [/projekt/, "/projekt", "projekten"],
  [/kalender/, "/kalender", "kalendern"],
  [/inställningar/, "/installningar", "inställningarna"],
  [/startsida|idag|hem/, "/", "startsidan"],
];

/** Finds active items whose title best matches the spoken words. */
export function findItems(query: string, items: NavetItem[]): NavetItem[] {
  const words = normalize(query)
    .split(" ")
    .filter((w) => w.length > 1 && !["att", "som", "med", "till", "den", "det", "en", "ett"].includes(w));
  if (!words.length) return [];
  const scored = items
    .filter(isActive)
    .map((i) => {
      const t = normalize(i.title);
      const hits = words.filter((w) => t.includes(w)).length;
      return { i, score: hits / words.length, exact: t === words.join(" ") };
    })
    .filter((s) => s.score >= 0.6)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score);
  if (!scored.length) return [];
  if (scored[0].exact) return [scored[0].i];
  const best = scored[0].score;
  return scored.filter((s) => s.score === best).map((s) => s.i);
}

/** Returns a Reply if the text is a question or command, or null if it should be captured. */
export function interpret(text: string, ctx: AssistantContext): Reply | null {
  const now = ctx.now ?? new Date();
  const today = toISODate(now);
  const q = normalize(text);
  if (!q) return null;
  const active = ctx.items.filter(isActive);
  const isQuestion = QUESTION.test(q) || text.trim().endsWith("?");

  // End of conversation
  if (/^(nej( tack)?|tack( så mycket)?|klart|det var allt|det var bra|avsluta|stäng|hej då|inget mer|inte nu)$/.test(q)) {
    return { kind: "stop", speech: "Okej. Hej så länge!" };
  }

  if (/^(hjälp|vad kan (jag|du) (säga|göra|fråga))/.test(q)) {
    return { kind: "answer", speech: HELP_TEXT, items: [], title: "Det här kan du säga" };
  }

  // Navigation: "visa inkorgen", "öppna förfrågningar", "gå till kalendern"
  const nav = q.match(/^(visa|öppna|gå till|ta mig till)\s+(.+)$/);
  if (nav) {
    const page = PAGES.find(([re]) => re.test(nav[2]));
    if (page) return { kind: "navigate", speech: `Öppnar ${page[2]}.`, href: page[1] };
  }

  // Complete: "markera ring johan som klar", "bocka av offerten", "ring johan är klar"
  const done =
    q.match(/^(?:markera|bocka av|stryk|klarmarkera)\s+(.+?)(?:\s+som\s+(?:klar|klart|gjord|gjort))?$/) ??
    q.match(/^(.+?)\s+är\s+(?:klar|klart|gjord|gjort|fixad|fixat)$/);
  if (done) {
    const found = findItems(done[1], active.filter((i) => i.type !== "idea" && i.type !== "note"));
    if (found.length === 1) return { kind: "complete", speech: `Klart. Jag har bockat av ${found[0].title}.`, item: found[0] };
    if (found.length > 1) {
      return {
        kind: "clarify",
        speech: `Jag hittade ${count(found.length, "sak", "saker")}: ${list(found, now, false)}. Säg vilken, med fler ord.`,
        items: found,
        title: "Vilken menar du?",
      };
    }
    return { kind: "answer", speech: `Jag hittade ingen aktiv sak som heter ${done[1]}.`, items: [], title: "Hittade inget" };
  }

  if (!isQuestion) return null;

  const actionable = active.filter((i) => isActionable(i) || i.type === "request").sort(byDue);

  // Today
  if (/(idag|i dag|dagens)/.test(q) && !/imorgon/.test(q)) {
    const due = actionable.filter((i) => i.dueDate === today);
    const late = actionable.filter((i) => isOverdue(i, today));
    const newReq = active.filter((i) => i.type === "request" && (i.stage ?? "new") === "new");
    const parts: string[] = [];
    parts.push(due.length ? `Idag har du ${count(due.length, "sak", "saker")}: ${list(due, now, false)}.` : "Du har inget planerat idag.");
    if (late.length) parts.push(`Du har också ${count(late.length, "försenad sak", "försenade saker")}: ${list(late, now)}.`);
    if (newReq.length) parts.push(`Och ${count(newReq.length, "ny förfrågan", "nya förfrågningar")} att svara på.`);
    return { kind: "answer", speech: parts.join(" "), items: [...late, ...due], title: "Idag" };
  }

  // Tomorrow
  if (/(imorgon|i morgon)/.test(q)) {
    const tomorrow = toISODate(addDays(now, 1));
    const due = actionable.filter((i) => i.dueDate === tomorrow);
    return {
      kind: "answer",
      speech: due.length ? `Imorgon har du ${count(due.length, "sak", "saker")}: ${list(due, now, false)}.` : "Du har inget planerat imorgon.",
      items: due,
      title: "Imorgon",
    };
  }

  // This week
  if (/(veckan|vecka)/.test(q)) {
    const end = toISODate(addDays(now, 7));
    const due = actionable.filter((i) => i.dueDate && i.dueDate >= today && i.dueDate <= end);
    return {
      kind: "answer",
      speech: due.length ? `De närmaste sju dagarna har du ${count(due.length, "sak", "saker")}: ${list(due, now)}.` : "Du har inget planerat den närmaste veckan.",
      items: due,
      title: "Den här veckan",
    };
  }

  // Overdue
  if (/(försenat|försenade|försenad|ligger efter|missat)/.test(q)) {
    const late = actionable.filter((i) => isOverdue(i, today));
    return {
      kind: "answer",
      speech: late.length ? `Du har ${count(late.length, "försenad sak", "försenade saker")}: ${list(late, now)}.` : "Inget är försenat. Bra jobbat!",
      items: late,
      title: "Försenat",
    };
  }

  // Requests
  if (/(förfrågningar|förfrågan|bokningar|bokning)/.test(q)) {
    const open = active
      .filter((i) => i.type === "request" && i.stage !== "booked" && i.stage !== "declined")
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const fresh = open.filter((i) => (i.stage ?? "new") === "new");
    const speech = !open.length
      ? "Du har inga öppna förfrågningar."
      : fresh.length
        ? `Du har ${count(fresh.length, "ny förfrågan", "nya förfrågningar")}: ${list(fresh, now, false)}.` +
          (open.length > fresh.length ? ` Plus ${count(open.length - fresh.length, "besvarad", "besvarade")} som väntar på beslut.` : "")
        : `Du har ${count(open.length, "besvarad förfrågan", "besvarade förfrågningar")} som väntar på beslut: ${list(open, now, false)}.`;
    return { kind: "answer", speech, items: open, title: "Förfrågningar" };
  }

  // Waiting for
  if (/väntar jag på/.test(q)) {
    const waiting = active.filter((i) => i.type === "waiting").sort(byDue);
    return {
      kind: "answer",
      speech: waiting.length ? `Du väntar på ${count(waiting.length, "sak", "saker")}: ${list(waiting, now)}.` : "Du väntar inte på något just nu.",
      items: waiting,
      title: "Väntar på",
    };
  }

  // Commitments: "vad har jag lovat", "vad har jag lovat martin"
  const promised = q.match(/(?:lovat|åtaganden|löften)(?:\s+(?:till\s+)?(\S+))?/);
  if (promised) {
    let commitments = active.filter((i) => i.type === "commitment").sort(byDue);
    const who = promised[1];
    if (who && !["jag", "mig", "nu"].includes(who)) commitments = commitments.filter((i) => i.person?.toLowerCase().startsWith(who));
    const target = who && !["jag", "mig", "nu"].includes(who) ? ` till ${who.charAt(0).toUpperCase()}${who.slice(1)}` : "";
    return {
      kind: "answer",
      speech: commitments.length
        ? `Du har lovat ${count(commitments.length, "sak", "saker")}${target}: ${list(commitments, now)}.`
        : `Du har inga öppna löften${target}.`,
      items: commitments,
      title: "Åtaganden",
    };
  }

  // Inbox
  if (/inkorg/.test(q)) {
    const inbox = active.filter((i) => i.status === "inbox").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return {
      kind: "answer",
      speech: inbox.length ? `Inkorgen har ${count(inbox.length, "sak", "saker")}: ${list(inbox, now, false)}.` : "Inkorgen är tom.",
      items: inbox,
      title: "Inkorgen",
    };
  }

  // Project: "vad händer i ugl", "vad har jag inom yh"
  const project = findProject(q, ctx.projects).project;
  if (project) {
    const inProject = active.filter((i) => i.projectId === project.id && i.type !== "note").sort(byDue);
    return {
      kind: "answer",
      speech: inProject.length
        ? `I ${project.name} har du ${count(inProject.length, "aktiv sak", "aktiva saker")}: ${list(inProject, now)}.`
        : `Det finns inget aktivt i ${project.name}.`,
      items: inProject,
      title: project.name,
    };
  }

  return {
    kind: "answer",
    speech: "Det kan jag inte svara på ännu. Säg hjälp för att höra vad du kan fråga.",
    items: [],
    title: "Förstod inte frågan",
  };
}
