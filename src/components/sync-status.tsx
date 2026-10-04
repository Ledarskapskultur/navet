"use client";

import clsx from "clsx";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/dates";
import { useNavet } from "./navet-provider";

/** "Synkad med Google för 2 minuter sedan" + sync button. */
export function SyncStatus({ compact }: { compact?: boolean }) {
  const { sync, syncing, syncNow, status } = useNavet();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const label = syncing
    ? "Synkar…"
    : sync?.lastError
      ? "Synkfel"
      : sync?.lastSyncAt
        ? `Synkad ${relativeTime(sync.lastSyncAt)}`
        : "Inte synkad än";
  const dot = sync?.lastError ? "bg-warn" : status?.mode === "google" ? "bg-accent" : "bg-amber";

  return (
    <button
      onClick={() => syncNow()}
      disabled={syncing}
      title={sync?.lastError ?? "Synka nu med Google Tasks"}
      className={clsx(
        "group flex items-center gap-2 rounded-lg text-left text-xs text-ink-2 hover:text-ink",
        compact ? "h-9 px-2" : "w-full",
      )}
    >
      <span className={clsx("size-2 shrink-0 rounded-full", dot)} />
      <span className={clsx("truncate", compact && "max-w-[140px]")}>{label}</span>
      <RefreshCw className={clsx("ml-auto size-3.5 shrink-0 text-ink-3", syncing && "animate-spin")} />
    </button>
  );
}
