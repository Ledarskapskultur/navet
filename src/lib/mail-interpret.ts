// Rule-based "AI interpretation" of a flagged mail. Shaped so an LLM call can
// later return the same MailInterpretation structure.
import { extractDate, parseCapture } from "./parser";
import type { FlaggedMail, ItemType, Project } from "./types";

export interface MailInterpretation {
  type: ItemType;
  title: string;
  dueDate: string | null;
  deadlineText: string | null;
  projectId: string | null;
  person: string;
}

const DEADLINE_RE = /\b(?:senast|innan|före|till|på)\s+(?:den\s+)?(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag|imorgon|idag|\d{1,2}\s+\w+)/i;

export function interpretMail(mail: FlaggedMail, projects: Project[], now = new Date()): MailInterpretation {
  const firstName = mail.from.split(" ")[0];
  const text = `${mail.subject}. ${mail.preview}`;
  const ctx = parseCapture(text, projects, now);
  const date = extractDate(text, now);
  const deadlineMatch = text.match(DEADLINE_RE);
  const deadlineText = deadlineMatch ? capitalize(deadlineMatch[1]) : null;

  let type: ItemType = "task";
  let title: string;

  const ask = mail.subject.match(/^(?:kan|kunde|skulle)\s+du\s+(.+?)(?:\s+(?:senast|innan|före|till|på)\s.*)?\??$/i);
  if (/^idé\b|idé:/i.test(mail.subject)) {
    type = "idea";
    title = capitalize(mail.subject.replace(/^idé:\s*/i, ""));
  } else if (/du (?:nämnde|lovade|sa) att du skulle/i.test(mail.preview)) {
    type = "commitment";
    const m = mail.preview.match(/du skulle (.+?)(?:\s+(?:innan|senast|till|på)\s.*)?(?:\s*[–-].*)?$/i);
    title = capitalize(m ? `${m[1]} till ${firstName}` : mail.subject);
  } else if (ask) {
    title = capitalize(ask[1].replace(/\?$/, ""));
    if (/^(skicka|maila|mejla|ge|ta fram)\b/i.test(title)) title = `${title} till ${firstName}`;
  } else {
    title = capitalize(mail.subject.replace(/^(re|sv|fwd?):\s*/i, ""));
  }

  return {
    type,
    title: title.replace(/\s+/g, " ").trim(),
    dueDate: date.date,
    deadlineText,
    projectId: ctx.projectId,
    person: mail.from,
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
