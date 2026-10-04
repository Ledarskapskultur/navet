"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  FolderKanban,
  Handshake,
  Hourglass,
  Inbox,
  Lightbulb,
  ListChecks,
  Mail,
  Menu,
  Mic,
  Plus,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useNavet } from "./navet-provider";
import { CaptureDialog } from "./capture-dialog";
import { ItemEditor } from "./item-editor";
import { SyncStatus } from "./sync-status";
import { GoogleTasksIcon } from "./icons";
import { isActive } from "@/lib/selectors";
import { isStandalone, voiceOnLaunchEnabled } from "@/lib/voice-launch";

interface NavItem {
  href: string;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
  count?: number;
}

function useNav() {
  const { items } = useNavet();
  const inbox = items.filter((i) => i.status === "inbox").length;
  const main: NavItem[] = [
    { href: "/", label: "Idag", icon: Sun },
    { href: "/inkorg", label: "Inkorg", icon: Inbox, count: inbox || undefined },
    { href: "/att-gora", label: "Att göra", icon: ListChecks },
    { href: "/vantar-pa", label: "Väntar på", icon: Hourglass, count: items.filter((i) => i.type === "waiting" && isActive(i)).length || undefined },
    { href: "/ataganden", label: "Åtaganden", icon: Handshake },
    { href: "/ideer", label: "Idéer", icon: Lightbulb },
    { href: "/projekt", label: "Projekt", icon: FolderKanban },
    { href: "/kalender", label: "Kalender", icon: CalendarDays },
    { href: "/mail", label: "Mail att hantera", icon: Mail },
  ];
  const integrations: NavItem[] = [
    { href: "/google-tasks", label: "Google Tasks", icon: GoogleTasksIcon },
    { href: "/rost-google", label: "Röst & Google", icon: Mic },
    { href: "/installningar", label: "Inställningar", icon: Settings },
  ];
  return { main, integrations };
}

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname();
  const active = isCurrent(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={clsx(
        "flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors",
        active ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:bg-sunken/60 hover:text-ink",
      )}
    >
      <Icon className={clsx("size-[18px] shrink-0", active ? "text-accent" : "text-ink-3")} />
      <span className="flex-1">{item.label}</span>
      {item.count !== undefined && <span className="text-xs tabular-nums text-ink-3">{item.count}</span>}
    </Link>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-[10px] bg-accent">
        <span className="size-3 rounded-full border-[2.5px] border-white" />
      </span>
      <span className="text-lg font-semibold tracking-tight">Navet</span>
    </Link>
  );
}

function DemoBanner() {
  const { status } = useNavet();
  if (status?.mode !== "demo") return null;
  return (
    <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-amber/20 bg-amber-soft/70 px-4 py-3 text-sm text-amber sm:flex-row sm:items-center sm:justify-between">
      <p>
        <strong className="font-semibold">Demoläge.</strong> Du ser exempeldata och en simulerad Google Tasks.
      </p>
      <Link href="/installningar" className="font-medium underline underline-offset-2">
        {status.googleConfigured ? "Logga in med Google" : "Så kopplar du Google"}
      </Link>
    </div>
  );
}

function Toasts() {
  const { toasts } = useNavet();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "animate-in pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm shadow-pop",
            t.tone === "error" ? "bg-warn text-white" : "bg-ink text-white",
          )}
          role="status"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { openCapture, status, ready } = useNavet();
  const { main, integrations } = useNav();
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();

  // PWA shortcuts: "/?fanga=1" opens quick capture, "/?fanga=1&rost=1" starts listening at once.
  // With "Starta röst när Navet öppnas" on, launching the installed app (e.g. "Hey Google, öppna Navet")
  // goes straight to listening too.
  const launchHandled = useRef(false);
  useEffect(() => {
    if (!ready || launchHandled.current) return;
    launchHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.has("fanga")) {
      window.history.replaceState(null, "", window.location.pathname);
      openCapture("", { voice: params.has("rost") });
      return;
    }
    if (isStandalone() && voiceOnLaunchEnabled() && window.location.pathname === "/") {
      openCapture("", { voice: true });
    }
  }, [ready, openCapture]);

  // Keyboard shortcut: "n" or Ctrl/Cmd+K opens quick capture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (!typing && e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        openCapture();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCapture]);

  const bottom: NavItem[] = [main[0], main[1], main[2]];

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-[264px] flex-col border-r border-line bg-subtle/70 px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <button
          onClick={() => openCapture()}
          className="mt-7 flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-medium text-white shadow-card transition-colors hover:bg-accent-strong"
        >
          <Plus className="size-5" /> Fånga
          <kbd className="ml-1 rounded bg-white/15 px-1.5 text-[11px] font-normal">N</kbd>
        </button>
        <nav className="mt-6 flex-1 space-y-0.5 overflow-y-auto">
          {main.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
          <p className="px-3 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">Integrationer</p>
          {integrations.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>
        <div className="mt-4 border-t border-line px-2 pt-4">
          <SyncStatus />
          <p className="mt-2 truncate text-xs text-ink-3">
            {status?.mode === "google" ? status.user?.email : "Demoläge"}
          </p>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <SyncStatus compact />
      </header>

      <main className="lg:pl-[264px]">
        <div className="mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-8 lg:px-12 lg:pb-16 lg:pt-12">
          <DemoBanner />
          {ready ? (
            <div key={pathname}>{children}</div>
          ) : (
            <div className="space-y-4">
              <div className="h-10 w-64 animate-pulse rounded-xl bg-sunken" />
              <div className="h-40 animate-pulse rounded-2xl bg-sunken/70" />
              <div className="h-40 animate-pulse rounded-2xl bg-sunken/50" />
            </div>
          )}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          {bottom.slice(0, 2).map((item) => (
            <BottomLink key={item.href} item={item} />
          ))}
          <div className="flex justify-center">
            <button
              onClick={() => openCapture()}
              aria-label="Fånga"
              className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-accent text-white shadow-pop active:scale-95"
            >
              <Plus className="size-7" />
            </button>
          </div>
          <BottomLink item={bottom[2]} />
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 text-[11px] text-ink-3">
            <Menu className="size-5" />
            Mer
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Stäng" className="absolute inset-0 bg-ink/25" onClick={() => setMoreOpen(false)} />
          <div className="animate-in pb-safe absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-canvas p-4">
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-sm font-semibold text-ink-3">Navet</span>
              <button onClick={() => setMoreOpen(false)} className="rounded-lg p-2 text-ink-3" aria-label="Stäng">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-0.5">
              {main.map((item) => (
                <NavLink key={item.href} item={item} onClick={() => setMoreOpen(false)} />
              ))}
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">Integrationer</p>
              {integrations.map((item) => (
                <NavLink key={item.href} item={item} onClick={() => setMoreOpen(false)} />
              ))}
            </div>
          </div>
        </div>
      )}

      <CaptureDialog />
      <ItemEditor />
      <Toasts />
    </div>
  );
}

function BottomLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = isCurrent(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link href={item.href} className={clsx("relative flex flex-col items-center gap-0.5 text-[11px]", active ? "text-accent" : "text-ink-3")}>
      <Icon className="size-5" />
      {item.label}
      {item.count ? (
        <span className="absolute -top-1 right-[calc(50%-18px)] min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 text-white">
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}
