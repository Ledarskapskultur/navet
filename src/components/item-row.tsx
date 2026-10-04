"use client";

import clsx from "clsx";
import { Check, Clock, User } from "lucide-react";
import { isOverdue } from "@/lib/selectors";
import type { NavetItem } from "@/lib/types";
import { useNavet } from "./navet-provider";
import { DueBadge, Pill, PriorityBadge, ProjectBadge, SourceBadge, TypeBadge } from "./ui";

export function ItemRow({
  item,
  showType = true,
  showProject = true,
  compact,
}: {
  item: NavetItem;
  showType?: boolean;
  showProject?: boolean;
  compact?: boolean;
}) {
  const { toggleDone, openItem, projectById, listName } = useNavet();
  const done = item.status === "done";
  const checkable = item.type !== "idea" && item.type !== "note";
  const overdue = isOverdue(item);

  return (
    <div
      className={clsx(
        "group flex items-start gap-3 border-b border-line px-4 last:border-b-0 hover:bg-canvas/60",
        compact ? "py-3" : "py-3.5",
      )}
    >
      {checkable ? (
        <button
          onClick={() => toggleDone(item)}
          aria-label={done ? "Markera som ej klar" : "Markera som klar"}
          className={clsx(
            "mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
            done ? "border-accent bg-accent text-white" : "border-line-strong text-transparent hover:border-accent hover:text-accent",
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </button>
      ) : (
        <span className="mt-0.5 size-[22px] shrink-0" />
      )}
      <button onClick={() => openItem(item)} className="min-w-0 flex-1 text-left">
        <p className={clsx("text-[15px] leading-snug", done ? "text-ink-3 line-through" : "text-ink")}>{item.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {showType && item.type !== "task" && <TypeBadge type={item.type} />}
          <DueBadge date={item.dueDate} time={item.dueTime} overdue={overdue} />
          <PriorityBadge priority={item.priority} />
          {item.waitingFor && (
            <Pill className="bg-subtle text-ink-2">
              <Clock className="size-3" />
              {item.waitingFor}
            </Pill>
          )}
          {item.person && !item.waitingFor && (
            <Pill className="bg-subtle text-ink-2">
              <User className="size-3" />
              {item.person}
            </Pill>
          )}
          {item.estimatedTime ? <Pill className="text-ink-3">{item.estimatedTime} min</Pill> : null}
          <SourceBadge source={item.source} listName={item.externalProvider === "google_tasks" ? listName(item.externalListId) : null} />
          {item.source !== "google_tasks" && item.externalProvider === "google_tasks" && (
            <SourceBadge source="google_tasks" listName={listName(item.externalListId)} />
          )}
          {showProject && <ProjectBadge project={projectById(item.projectId)} />}
        </div>
      </button>
    </div>
  );
}

export function ItemList({ items, empty, ...rest }: { items: NavetItem[]; empty?: React.ReactNode } & Omit<Parameters<typeof ItemRow>[0], "item">) {
  if (!items.length) return <>{empty ?? null}</>;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {items.map((i) => (
        <ItemRow key={i.id} item={i} {...rest} />
      ))}
    </div>
  );
}
