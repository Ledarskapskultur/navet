import {
  Bell,
  CalendarCheck,
  Globe,
  CalendarDays,
  CircleCheck,
  Handshake,
  Hourglass,
  Lightbulb,
  Mail,
  Mic,
  PenLine,
  StickyNote,
  type LucideProps,
} from "lucide-react";
import type { ItemSource, ItemType } from "@/lib/types";

export function TypeIcon({ type, ...props }: { type: ItemType } & LucideProps) {
  const Icon = {
    task: CircleCheck,
    idea: Lightbulb,
    commitment: Handshake,
    note: StickyNote,
    waiting: Hourglass,
    reminder: Bell,
    request: CalendarCheck,
  }[type];
  return <Icon aria-hidden {...props} />;
}

export function SourceIcon({ source, ...props }: { source: ItemSource } & LucideProps) {
  if (source === "google_tasks") return <GoogleTasksIcon className={props.className} />;
  const Icon = { manual: PenLine, voice: Mic, outlook_mail: Mail, outlook_calendar: CalendarDays, web_form: Globe }[source];
  return <Icon aria-hidden {...props} />;
}

/** Neutral "tasks" glyph used for the Google Tasks source badge. */
export function GoogleTasksIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden fill="none">
      <rect x="1" y="1" width="14" height="14" rx="4" fill="#4c8bf5" />
      <path d="M4.8 8.2l2.1 2.1 4.3-4.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Neutral "in" glyph for the LinkedIn integration (follows the text colour, no brand colours). */
export function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 11v6M8 7.5v.01M12 17v-3.5a2 2 0 0 1 4 0V17M12 11v6" />
    </svg>
  );
}
