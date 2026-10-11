// Light / dark theme. "system" follows the device; the choice is kept per device.

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "navet-theme";

export const THEME_LABEL: Record<ThemeChoice, string> = { system: "Automatiskt", light: "Ljus", dark: "Mörk" };

/** Runs in <head> before the page is painted. Kept tiny and dependency-free. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();

/** For useSyncExternalStore: re-render the toggles when the theme is changed anywhere. */
export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private mode etc. – the theme still applies for this visit.
  }
  listeners.forEach((l) => l());
}
