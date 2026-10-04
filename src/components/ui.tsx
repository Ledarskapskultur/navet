"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { PRIORITY_LABEL, SOURCE_LABEL, TYPE_LABEL } from "@/lib/labels";
import { formatDue } from "@/lib/dates";
import type { ItemSource, ItemType, Priority, Project } from "@/lib/types";
import { GoogleTasksIcon, SourceIcon, TypeIcon } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-[15px]",
        variant === "primary" && "bg-accent text-white hover:bg-accent-strong",
        variant === "secondary" && "border border-line bg-surface text-ink hover:bg-subtle",
        variant === "ghost" && "text-ink-2 hover:bg-subtle hover:text-ink",
        variant === "danger" && "border border-line bg-surface text-warn hover:bg-warn-soft",
        className,
      )}
    />
  );
}

export function Card({ className, children, as: Tag = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" }) {
  return <Tag className={clsx("rounded-2xl border border-line bg-surface shadow-card", className)}>{children}</Tag>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  count,
  action,
  children,
  className,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("mb-10", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          {title}
          {count !== undefined && <span className="ml-2 font-normal normal-case tracking-normal text-ink-3">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const TYPE_STYLE: Record<ItemType, string> = {
  task: "bg-subtle text-ink-2",
  idea: "bg-[#ece7f2] text-[#5b4a78]",
  commitment: "bg-amber-soft text-amber",
  note: "bg-[#e5ebef] text-[#46606f]",
  waiting: "bg-[#f1e5e1] text-[#85513f]",
  reminder: "bg-accent-soft text-accent",
  request: "bg-[#e2ecf0] text-[#35596a]",
};

export function Pill({ className, children, title }: { className?: string; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={clsx("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium", className)}
    >
      {children}
    </span>
  );
}

export function TypeBadge({ type }: { type: ItemType }) {
  return (
    <Pill className={TYPE_STYLE[type]}>
      <TypeIcon type={type} className="size-3" />
      {TYPE_LABEL[type]}
    </Pill>
  );
}

export function SourceBadge({ source, listName }: { source: ItemSource; listName?: string | null }) {
  if (source === "manual") return null;
  if (source === "google_tasks") {
    return (
      <Pill className="border border-line bg-surface text-ink-2" title={listName ? `Google Tasks-lista: ${listName}` : undefined}>
        <GoogleTasksIcon className="size-3" />
        {listName ? `Google · ${listName}` : SOURCE_LABEL.google_tasks}
      </Pill>
    );
  }
  return (
    <Pill className="border border-line bg-surface text-ink-2">
      <SourceIcon source={source} className="size-3" />
      {SOURCE_LABEL[source]}
    </Pill>
  );
}

export function ProjectBadge({ project }: { project?: Project }) {
  if (!project) return null;
  return (
    <Pill className="bg-transparent px-0 text-ink-2">
      <span className="size-2 rounded-full" style={{ background: project.color }} />
      {project.name}
    </Pill>
  );
}

export function DueBadge({ date, time, overdue }: { date: string | null; time?: string | null; overdue?: boolean }) {
  if (!date) return null;
  return (
    <Pill className={overdue ? "bg-warn-soft text-warn" : "bg-subtle text-ink-2"}>{formatDue(date, time)}</Pill>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority !== "high") return null;
  return <Pill className="bg-amber-soft text-amber">Prio {PRIORITY_LABEL[priority].toLowerCase()}</Pill>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:p-6 sm:pt-[10vh]" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Stäng" className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={clsx(
          "animate-in relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-pop sm:rounded-3xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="-mr-2 rounded-lg p-2 text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Stäng">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-3">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft";

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex gap-1 rounded-xl bg-subtle p-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={clsx(
              "h-8 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors",
              value === o.value ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="ml-1.5 text-ink-3">{o.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Notice({ tone = "info", children, icon }: { tone?: "info" | "muted"; children: ReactNode; icon?: ReactNode }) {
  return (
    <div
      className={clsx(
        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-relaxed",
        tone === "info" ? "border-accent/15 bg-accent-soft/60 text-accent-strong" : "border-line bg-subtle text-ink-2",
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}
