// Turning a person who engaged with a post into something to follow up in Navet.
// Navet never contacts anyone: the message itself is written by the owner on LinkedIn.
import { addDaysISO, todayISO } from "./dates";
import { SEGMENT_LABEL } from "./integrations/linkedin/segments";
import type { EngagedPerson, LinkedInPost, NavetItem, NewItemInput } from "./types";

/** The marker that links a Navet item to the LinkedIn person it was created for. */
const personTag = (id: string) => `[linkedin:${id}]`;

const quote = (text: string, max: number) => `”${text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text}”`;

/** A suggested first line. A starting point for the owner to rewrite, never sent by Navet. */
export function suggestedOpener(person: EngagedPerson, post: LinkedInPost | undefined): string {
  const first = person.name.split(" ")[0];
  const did = person.latestKind === "commenter" ? "kommenterade" : "gillade";
  const about = post?.text ? ` om ${quote(post.text, 60)}` : "";
  return `Hej ${first}! Tack för att du ${did} mitt inlägg${about}. Vad var det som fick dig att stanna upp?`;
}

/** A new inbox item for following up a person. Due tomorrow: reaching out the same minute reads as pushy. */
export function personToItem(person: EngagedPerson, post: LinkedInPost | undefined): NewItemInput {
  const did = person.latestKind === "commenter" ? "Kommenterade" : "Gillade";
  const lines = [
    `Från LinkedIn: ${did} ditt inlägg${post?.text ? ` ${quote(post.text, 80)}` : ""}.`,
    person.subtitle,
    `Målgrupp: ${SEGMENT_LABEL[person.segment]}`,
    person.latestComment ? `Kommentar: ${quote(person.latestComment, 200)}` : null,
    person.profileUrl ? `Profil: ${person.profileUrl}` : null,
    post ? `Inlägg: ${post.url}` : null,
    `Förslag på öppning: ${suggestedOpener(person, post)}`,
    personTag(person.id),
  ];
  return {
    title: `Hör av dig till ${person.name}`,
    type: "task",
    status: "inbox",
    source: "manual",
    person: person.name,
    dueDate: addDaysISO(todayISO(), 1),
    description: lines.filter(Boolean).join("\n"),
  };
}

/** True when a follow-up has already been created for this person. */
export function personInNavet(person: EngagedPerson, items: NavetItem[]): boolean {
  return items.some((i) => i.description?.includes(personTag(person.id)));
}
