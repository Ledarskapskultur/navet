import type { ItemPatch, RequestStage } from "./types";

/** Moving a booking request to a stage also sets a sensible item status. */
export function stagePatch(stage: RequestStage): ItemPatch {
  const status = stage === "booked" ? "done" : stage === "declined" ? "archived" : "open";
  return { stage, status };
}
