/**
 * Spoken prompts for hands-free capture.
 *
 * Browsers may refuse speech synthesis before the user has touched the page. An
 * installed app (added to the home screen) is usually allowed to play sound, so
 * when speech is refused we fall back to a short chime – either way you hear
 * when Navet is ready to listen.
 */

export const READY_PROMPT = "Jag är redo. Vad vill du göra?";

function swedishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === "sv-SE") ?? voices.find((v) => v.lang.toLowerCase().startsWith("sv"));
}

/** Voices load asynchronously on some phones; wait briefly for them. */
function voicesReady(timeoutMs = 800): Promise<void> {
  if (window.speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve();
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
}

/** Speaks the text in Swedish. Resolves true when it was spoken, false if the browser refused. */
export async function speak(text: string): Promise<boolean> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  await voicesReady();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "sv-SE";
    const voice = swedishVoice();
    if (voice) u.voice = voice;
    u.rate = 1.05;
    let started = false;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    u.onstart = () => (started = true);
    u.onend = () => finish(started);
    u.onerror = () => finish(false);
    // Blocked speech often fails silently: give up if nothing has started shortly.
    setTimeout(() => !started && (window.speechSynthesis.cancel(), finish(false)), 1500);
    // Some engines never fire onend: don't wait forever.
    setTimeout(() => finish(started), 8000);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

/** A short, soft two-note chime. */
export async function chime(): Promise<void> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.16;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
    await new Promise((r) => setTimeout(r, 500));
    void ctx.close();
  } catch {
    // No audio available – the on-screen indicator still shows that Navet is listening.
  }
}

/** Say that Navet is ready (or chime), then resolve so listening can start. */
export async function announceReady(): Promise<void> {
  if (!(await speak(READY_PROMPT))) await chime();
}
