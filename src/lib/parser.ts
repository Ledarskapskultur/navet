// Rule-based interpretation of quick-capture text (Swedish).
// Designed so it can later be replaced or complemented by an LLM call that
// returns the same ParsedCapture shape.
import { addDays, nextDay, type Day } from "date-fns";
import { toISODate } from "./dates";
import type { ItemType, Priority, Project } from "./types";

export interface ParsedCapture {
  type: ItemType;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  projectId: string | null;
  person: string | null;
  waitingFor: string | null;
  priority: Priority;
  /** Human-readable explanations of what was recognised */
  hints: string[];
}

const WEEKDAYS: Record<string, Day> = {
  söndag: 0, sön: 0,
  måndag: 1, mån: 1,
  tisdag: 2, tis: 2,
  onsdag: 3, ons: 3,
  torsdag: 4, tors: 4,
  fredag: 5, fre: 5,
  lördag: 6, lör: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, januari: 0, feb: 1, februari: 1, mar: 2, mars: 2, apr: 3, april: 3, maj: 4,
  jun: 5, juni: 5, jul: 6, juli: 6, aug: 7, augusti: 7, sep: 8, sept: 8, september: 8,
  okt: 9, oktober: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const W = "[a-zåäöéA-ZÅÄÖÉ]";
// Names: capitalised word, optionally followed by a capitalised surname.
const NAME = "([A-ZÅÄÖ][a-zåäöé]+(?:\\s[A-ZÅÄÖ][a-zåäöé]+)?)";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cleanup(s: string): string {
  return s
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/^[\s,:;.\-–]+|[\s,:;\-–]+$/g, "")
    .trim();
}

interface DateMatch {
  date: string | null;
  time: string | null;
  text: string;
}

export function extractDate(input: string, now: Date = new Date()): DateMatch {
  let text = input;
  let date: string | null = null;
  let time: string | null = null;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) {
      fn(m);
      text = text.replace(m[0], " ");
      return true;
    }
    return false;
  };

  // Time: "kl 14", "kl. 14:30", "klockan 9"
  take(/\b(?:kl\.?|klockan)\s*(\d{1,2})(?:[:.](\d{2}))?\b/i, (m) => {
    time = `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
  });

  const prefix = "(?:\\b(?:senast|på|till|innan|före|nu på|den)\\s+)?";

  const rules: [RegExp, (m: RegExpMatchArray) => string][] = [
    [new RegExp(`${prefix}\\b(i\\s*dag|idag|ikväll|i kväll)\\b`, "i"), () => toISODate(now)],
    [new RegExp(`${prefix}\\b(i\\s*morgon|imorgon|imorn|i morn)\\b`, "i"), () => toISODate(addDays(now, 1))],
    [new RegExp(`${prefix}\\b(i\\s*övermorgon|iövermorgon)\\b`, "i"), () => toISODate(addDays(now, 2))],
    [new RegExp(`${prefix}\\bnästa vecka\\b`, "i"), () => toISODate(nextDay(now, 1))],
    // ISO date 2026-10-12
    [new RegExp(`${prefix}\\b(\\d{4})-(\\d{2})-(\\d{2})\\b`, "i"), (m) => `${m[1]}-${m[2]}-${m[3]}`],
    // 12 okt / 12 oktober
    [
      new RegExp(`${prefix}\\b(\\d{1,2})\\s+(${Object.keys(MONTHS).join("|")})\\b\\.?`, "i"),
      (m) => {
        const month = MONTHS[m[2].toLowerCase()];
        let d = new Date(now.getFullYear(), month, Number(m[1]));
        if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          d = new Date(now.getFullYear() + 1, month, Number(m[1]));
        }
        return toISODate(d);
      },
    ],
    // 12/10 (day/month)
    [
      new RegExp(`${prefix}\\b(\\d{1,2})/(\\d{1,2})\\b`, "i"),
      (m) => {
        let d = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[1]));
        if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          d = new Date(now.getFullYear() + 1, Number(m[2]) - 1, Number(m[1]));
        }
        return toISODate(d);
      },
    ],
    // weekday – "på torsdag", "senast fredag", "nästa tisdag"
    [
      new RegExp(
        `${prefix}(?:\\bnästa\\s+)?\\b(${Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join("|")})(?:en)?\\b`,
        "i",
      ),
      (m) => {
        const wd = WEEKDAYS[m[1].toLowerCase()];
        const isNext = /nästa/i.test(m[0]);
        if (now.getDay() === wd) return toISODate(isNext ? addDays(now, 7) : now);
        let d = nextDay(now, wd);
        // "nästa fredag" means the Friday of next week if that weekday is still ahead this week
        const daysToMonday = ((8 - now.getDay()) % 7) || 7;
        if (isNext && d < addDays(now, daysToMonday)) d = addDays(d, 7);
        return toISODate(d);
      },
    ],
  ];

  for (const [re, fn] of rules) {
    if (take(re, (m) => (date = fn(m)))) break;
  }

  if (time && !date) date = toISODate(now);
  return { date, time, text };
}

export function findProject(text: string, projects: Project[]): { project: Project | null; text: string } {
  const lower = text.toLowerCase();
  let best: { project: Project; term: string } | null = null;
  for (const p of projects) {
    if (p.archived) continue;
    const terms = [p.name, ...p.aliases].map((t) => t.toLowerCase()).sort((a, b) => b.length - a.length);
    for (const term of terms) {
      const re = new RegExp(`(^|[^${W.slice(1, -1)}])${term.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?=$|[^${W.slice(1, -1)}])`, "i");
      if (re.test(lower) && (!best || term.length > best.term.length)) {
        best = { project: p, term };
        break;
      }
    }
  }
  if (!best) return { project: null, text };
  // Remove "till UGL:" / "för UGL" / "(UGL)" / "#ugl" style mentions, keep natural mentions otherwise.
  const esc = best.term.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const stripped = text
    .replace(new RegExp(`\\s*(?:till|för|i|inom|projekt)\\s+${esc}\\s*:`, "i"), ":")
    .replace(new RegExp(`#${esc}\\b`, "i"), " ")
    .replace(new RegExp(`\\(${esc}\\)`, "i"), " ")
    .replace(new RegExp(`^\\s*${esc}\\s*:`, "i"), " ");
  return { project: best.project, text: stripped };
}

export function parseCapture(input: string, projects: Project[] = [], now: Date = new Date()): ParsedCapture {
  const hints: string[] = [];
  let text = input.trim();
  let type: ItemType = "task";
  let person: string | null = null;
  let waitingFor: string | null = null;
  let priority: Priority = "normal";

  // Spoken lead-ins: "Lägg till en uppgift att …", "Skapa en påminnelse om …", "Kan du notera …"
  let forcedType: ItemType | null = null;
  const lead = text.match(
    /^\s*(?:(?:hej\s+)?navet[,!]?\s*)?(?:kan du\s+|vill du\s+)?(?:lägg(?:a)?\s+till|lägg(?:a)?\s+in|skapa|notera|skriv(?:\s+upp)?|spara|ny|nytt)\s+(?:en\s+|ett\s+)?(?:ny\s+|nytt\s+)?(uppgift|påminnelse|idé|anteckning|åtagande|förfrågan|bokning)?\s*(?:om\s+att|att|om|:)?\s*/i,
  );
  if (lead && lead[0].trim()) {
    const word = lead[1]?.toLowerCase();
    const map: Record<string, ItemType> = {
      uppgift: "task",
      påminnelse: "reminder",
      idé: "idea",
      anteckning: "note",
      åtagande: "commitment",
      förfrågan: "request",
      bokning: "request",
    };
    if (word) forcedType = map[word];
    const rest = text.slice(lead[0].length).trim();
    // Keep the original if nothing meaningful follows (e.g. "Lägg till en").
    if (rest && !/^(en|ett)$/i.test(rest)) text = rest;
  }

  // Priority markers
  if (/(^|\s)(!{1,3}|viktigt|brådskande|akut|prio)(\s|$|[:,.])/i.test(text)) {
    priority = "high";
    text = text.replace(/(^|\s)(!{1,3}|viktigt|brådskande|akut|prio)(?=\s|$|[:,.])/gi, " ");
    hints.push("Hög prioritet");
  }

  // Date & time
  const dm = extractDate(text, now);
  text = dm.text;

  // Project
  const pm = findProject(text, projects);
  text = pm.text;

  // Type classification
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^\s*(?:jag\s+)?(?:har\s+)?lovat?(?:de)?\s+(?:att\s+)?/i))) {
    type = "commitment";
    text = text.slice(m[0].length);
    const pm2 = text.match(new RegExp(`^${NAME}\\s+(?:att\\s+)?`));
    if (pm2) {
      person = pm2[1];
      text = text.slice(pm2[0].length);
    }
    hints.push("”jag lovade” → åtagande");
  } else if ((m = text.match(/^\s*(?:jag\s+)?väntar\s+på\s+(?:att\s+)?/i))) {
    type = "waiting";
    text = text.slice(m[0].length);
    const pm2 = text.match(new RegExp(`^${NAME}(?:s)?\\b\\s*`));
    if (pm2) {
      waitingFor = pm2[1];
      text = text.slice(pm2[0].length).replace(/^(?:ska\s+|att\s+)?/, "");
      if (!text.trim()) text = `Svar från ${waitingFor}`;
    } else {
      const from = text.match(new RegExp(`\\b(?:från|av)\\s+${NAME}`));
      if (from) waitingFor = from[1];
    }
    hints.push("”väntar på” → väntar på");
  } else if ((m = text.match(/^\s*(?:påminn(?:\s+mig)?(?:\s+om)?(?:\s+att)?|kom\s+ihåg\s+(?:att\s+)?)\s*/i))) {
    type = "reminder";
    text = text.slice(m[0].length);
    hints.push("”påminn mig” → påminnelse");
  } else if ((m = text.match(/^\s*(?:ny\s+)?(?:idé|ide|idea)(?=$|[\s:,.!?])\s*(?:till|för|om)?\s*:?\s*/i))) {
    type = "idea";
    text = text.slice(m[0].length);
    hints.push("”idé” → idé");
  } else if ((m = text.match(/^\s*(?:bokningsförfrågan|förfrågan|bokning|ny bokning)\b\s*:?\s*/i))) {
    type = "request";
    text = text.slice(m[0].length);
    hints.push("”förfrågan” → förfrågan");
  } else if ((m = text.match(/^\s*(?:anteckning|notering|not|obs)\b\s*:?\s*/i))) {
    type = "note";
    text = text.slice(m[0].length);
    hints.push("”anteckning” → anteckning");
  } else if (/(^|\s)idé(?=$|[\s:,.!?])/i.test(text)) {
    type = "idea";
    text = text.replace(/(^|\s)idé\s*:?/i, " ");
    hints.push("”idé” → idé");
  }

  // Person for tasks: "Ring Johan", "Mejla Anna", "Skicka ... till Anna"
  if (!person && !waitingFor) {
    const verbs = ["ring", "ringa", "mejla", "maila", "smsa", "träffa", "fråga", "kontakta", "påminn", "tacka", "svara"]
      .map((v) => `[${v[0].toUpperCase()}${v[0]}]${v.slice(1)}`)
      .join("|");
    const pm3 =
      text.match(new RegExp(`(?:^|\\s)(?:${verbs})\\s+${NAME}`)) ?? text.match(new RegExp(`\\b(?:till|med)\\s+${NAME}`));
    if (pm3 && !projects.some((p) => p.name.toLowerCase().startsWith(pm3[1].toLowerCase()))) person = pm3[1];
  }

  if (forcedType && forcedType !== type) {
    type = forcedType;
    hints.push(`Sagt: ${forcedType}`);
  }

  let title = cleanup(text.replace(/^[:\-–]\s*/, ""));
  title = capitalize(title || input.trim());

  if (dm.date) hints.push(`Datum: ${dm.date}${dm.time ? ` ${dm.time}` : ""}`);
  if (pm.project) hints.push(`Projekt: ${pm.project.name}`);
  if (person) hints.push(`Person: ${person}`);
  if (waitingFor) hints.push(`Väntar på: ${waitingFor}`);

  return {
    type,
    title,
    dueDate: dm.date,
    dueTime: dm.time,
    projectId: pm.project?.id ?? null,
    person,
    waitingFor,
    priority,
    hints,
  };
}
