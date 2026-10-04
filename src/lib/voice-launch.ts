/**
 * Hands-free voice capture on launch.
 *
 * Android has no way for a web app to listen for a wake word in the background, so the
 * phone's own assistant does the waking: "Hey Google, öppna Navet" launches the installed
 * app, and with this setting on, Navet starts listening immediately and saves what you say.
 * The setting is per device (localStorage), since it only makes sense on the phone.
 */

const KEY = "navet.voiceOnLaunch";
const EVENT = "navet:voice-launch";

/** For useSyncExternalStore: re-read the setting when it changes in this tab. */
export function subscribeVoiceOnLaunch(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function voiceOnLaunchEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setVoiceOnLaunch(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage blocked (private mode etc.); setting just won't stick
  }
  window.dispatchEvent(new Event(EVENT));
}

const GREETING_KEY = "navet.voiceGreeting";

/** Whether Navet says "Jag är redo" before listening (on by default). */
export function voiceGreetingEnabled(): boolean {
  try {
    return window.localStorage.getItem(GREETING_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setVoiceGreeting(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(GREETING_KEY);
    else window.localStorage.setItem(GREETING_KEY, "0");
  } catch {
    // storage blocked; default (on) applies
  }
  window.dispatchEvent(new Event(EVENT));
}
