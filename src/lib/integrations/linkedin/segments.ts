import type { LeadSegment } from "../../types";

/**
 * Rough, rule-based sorting of the people who engage with a post into the owner's four target
 * groups, from the line under the person's name on LinkedIn ("HR-chef på Exempel AB").
 * No AI, no lookups: only keywords, so it will sometimes be wrong. Shared by server and browser.
 */
export const SEGMENT_LABEL: Record<LeadSegment, string> = {
  yh: "YH-anordnare",
  public: "Offentlig sektor",
  company: "Företagskund",
  ugl: "UGL-deltagare",
  other: "Övrig",
};

export const SEGMENT_HINT: Record<LeadSegment, string> = {
  yh: "Arbetar hos en utbildningsanordnare eller yrkeshögskola",
  public: "Arbetar i kommun, region, myndighet eller annan offentlig verksamhet",
  company: "Beslutsfattare som kan köpa ledarutveckling: vd, HR-ledning, verksamhetschef, ägare",
  ugl: "Chef, ledare eller HR som kan gå en UGL-kurs eller skicka medarbetare",
  other: "Matchar ingen av målgrupperna",
};

// JavaScript's \b only knows a-z, so Swedish letters need their own word boundary.
const LETTER = "a-zåäöéü0-9";
const word = (w: string) => new RegExp(`(^|[^${LETTER}])${w}([^${LETTER}]|$)`, "i");

interface Rule {
  segment: LeadSegment;
  /** Matched anywhere in the text, also inside a longer word ("chef" in "enhetschef") */
  parts: string[];
  /** Matched as whole words only ("vd", not "vdc") */
  words: RegExp[];
}

/** In priority order: the first rule that matches decides. */
const RULES: Rule[] = [
  {
    segment: "yh",
    parts: [
      "yrkeshögskol", "utbildningsledare", "utbildningsanordnare", "kursansvarig", "programansvarig",
      "nackademin", "newton kompetens", "iths", "john ericsson institutet", "yh mitt", "plushögskolan", "medieinstitutet",
      "teknikhögskolan", "ec utbildning", "yrkesakademin", "folkuniversitetet", "hermods", "lernia",
    ],
    words: [word("yh"), word("tuc"), word("tucsweden")],
  },
  {
    segment: "public",
    parts: [
      "kommun", "regionen", "landsting", "länsstyrelse", "myndighet", "förvaltningschef", "stadsdelsförvaltning", "statlig",
      "polisen", "försvarsmakten", "trafikverket", "skatteverket", "arbetsförmedlingen", "försäkringskassan",
      "migrationsverket", "kriminalvården", "domstol", "regeringskansliet", "universitet", "högskola",
    ],
    words: [new RegExp(`(^|[^${LETTER}])region\\s+[a-zåäö]`, "i"), new RegExp(`[a-zåäö]+s\\s+stad([^${LETTER}]|$)`, "i"), word("malmö stad")],
  },
  {
    segment: "company",
    parts: [
      "verkställande direktör", "hr-chef", "hr chef", "hr-direktör", "hr director", "hr manager", "head of", "people & culture",
      "people and culture", "personalchef", "personaldirektör", "hr business partner", "verksamhetschef", "affärsområdeschef",
      "managing director", "vice president", "direktör", "director", "grundare", "founder", "ägare", "owner",
      "learning & development", "kompetensutveckling",
    ],
    words: [word("vd"), word("ceo"), word("coo"), word("cfo"), word("cto"), word("chro"), word("hrbp"), word("vp"), word("partner"), word("l&d")],
  },
  {
    segment: "ugl",
    parts: ["chef", "ledare", "manager", "team lead", "teamlead", "förman", "supervisor", "scrum master", "produktägare", "product owner"],
    words: [word("hr"), word("lead")],
  },
];

export function classifySegment(subtitle: string | null): LeadSegment {
  const text = (subtitle ?? "").toLocaleLowerCase("sv");
  if (!text.trim()) return "other";
  for (const rule of RULES) {
    if (rule.parts.some((p) => text.includes(p)) || rule.words.some((w) => w.test(text))) return rule.segment;
  }
  return "other";
}

/** "HR-chef på Exempel AB | Ledarskap" → title "HR-chef", company "Exempel AB". Company is null when it cannot be told apart. */
export function parseSubtitle(subtitle: string | null): { title: string | null; company: string | null } {
  const s = subtitle?.replace(/\s+/g, " ").trim();
  if (!s) return { title: null, company: null };
  const m = /^(.+?)\s+(?:at|på|hos|@)\s+(.+)$/i.exec(s);
  if (!m) return { title: s.split(/\s[|•·]\s/)[0].trim() || null, company: null };
  return { title: m[1].trim() || null, company: m[2].split(/\s[|•·]\s/)[0].trim() || null };
}
