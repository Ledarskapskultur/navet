import { todayISO } from "./dates";
import type { NavetItem } from "./types";

export const isActive = (i: NavetItem) => i.status !== "done" && i.status !== "archived";
export const isActionable = (i: NavetItem) =>
  isActive(i) && (i.type === "task" || i.type === "reminder" || i.type === "commitment");

export const isOpenRequest = (i: NavetItem) => i.type === "request" && isActive(i) && i.stage !== "booked" && i.stage !== "declined";

export function isOverdue(i: NavetItem, today = todayISO()) {
  return isActive(i) && !!i.dueDate && i.dueDate < today;
}

export function isDueToday(i: NavetItem, today = todayISO()) {
  return isActive(i) && i.dueDate === today;
}

const PRIO = { high: 0, normal: 1, low: 2 } as const;

export function byDue(a: NavetItem, b: NavetItem) {
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  if ((a.dueTime ?? "99") !== (b.dueTime ?? "99")) return (a.dueTime ?? "99") < (b.dueTime ?? "99") ? -1 : 1;
  if (PRIO[a.priority] !== PRIO[b.priority]) return PRIO[a.priority] - PRIO[b.priority];
  return a.createdAt < b.createdAt ? 1 : -1;
}

export function byNewest(a: NavetItem, b: NavetItem) {
  return a.createdAt < b.createdAt ? 1 : -1;
}

/** "Viktigast idag": overdue + today + high priority, ranked, max n. */
export function mostImportant(items: NavetItem[], n = 5, today = todayISO()) {
  const score = (i: NavetItem) =>
    (isOverdue(i, today) ? 30 : 0) +
    (isDueToday(i, today) ? 20 : 0) +
    (i.priority === "high" ? 15 : 0) +
    (i.type === "commitment" ? 5 : 0) +
    (i.dueDate && i.dueDate <= today ? 0 : -5);
  return items
    .filter(
      (i) =>
        (isActionable(i) && (isOverdue(i, today) || isDueToday(i, today) || i.priority === "high")) ||
        (isActive(i) && i.type === "request" && i.stage === "new"),
    )
    .sort((a, b) => score(b) - score(a) || byDue(a, b))
    .slice(0, n);
}
