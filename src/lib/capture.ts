import type { ParsedCapture } from "./parser";
import type { ItemSource, ItemStatus, NewItemInput } from "./types";

/** Turns an interpreted capture into the fields of a new Navet item (shared by app and voice API). */
export function captureToItem(
  result: Omit<ParsedCapture, "hints">,
  opts: { source: ItemSource; status?: ItemStatus },
): NewItemInput {
  const isRequest = result.type === "request";
  return {
    title: result.title,
    type: result.type,
    status: opts.status ?? "inbox",
    source: opts.source,
    projectId: result.projectId,
    // For booking requests the spoken date is the requested event date, not a deadline.
    dueDate: isRequest ? null : result.dueDate,
    dueTime: isRequest ? null : result.dueTime,
    eventDate: isRequest ? result.dueDate : null,
    stage: isRequest ? "new" : null,
    contact: isRequest && result.person ? { name: result.person, email: null, phone: null, organization: null } : null,
    person: result.person,
    waitingFor: result.waitingFor,
    priority: result.priority,
  };
}
