"use client";

import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { applyTheme, readTheme, subscribeTheme, THEME_LABEL, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; icon: typeof Sun }[] = [
  { value: "light", icon: Sun },
  { value: "system", icon: Monitor },
  { value: "dark", icon: Moon },
];

/** Three-way switch: Ljus · Automatiskt · Mörk. */
export function ThemeToggle({ labels }: { labels?: boolean }) {
  // The saved choice lives in the browser; on the server (and before hydration) nothing is marked.
  const choice = useSyncExternalStore<ThemeChoice | null>(subscribeTheme, readTheme, () => null);

  return (
    <div role="radiogroup" aria-label="Utseende" className="inline-flex gap-1 rounded-xl bg-sunken/70 p-1">
      {OPTIONS.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          title={THEME_LABEL[value]}
          onClick={() => applyTheme(value)}
          className={clsx(
            "flex h-8 items-center justify-center gap-1.5 rounded-lg text-sm transition-colors",
            labels ? "px-3" : "w-9",
            choice === value ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {labels ? THEME_LABEL[value] : <span className="sr-only">{THEME_LABEL[value]}</span>}
        </button>
      ))}
    </div>
  );
}
