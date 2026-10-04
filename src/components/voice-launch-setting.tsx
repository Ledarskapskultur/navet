"use client";

import { useSyncExternalStore } from "react";
import { Mic, Volume2 } from "lucide-react";
import { Card } from "./ui";
import {
  setVoiceGreeting,
  setVoiceOnLaunch,
  subscribeVoiceOnLaunch,
  voiceGreetingEnabled,
  voiceOnLaunchEnabled,
} from "@/lib/voice-launch";
import { READY_PROMPT, speak } from "@/lib/speech";

export function VoiceLaunchSetting() {
  const on = useSyncExternalStore(subscribeVoiceOnLaunch, voiceOnLaunchEnabled, () => false);
  const greeting = useSyncExternalStore(subscribeVoiceOnLaunch, voiceGreetingEnabled, () => true);

  return (
    <Card className="space-y-4 p-5 text-sm text-ink-2">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setVoiceOnLaunch(e.target.checked)}
          className="mt-0.5 size-4 accent-[#2f5d4e]"
        />
        <span>
          <span className="flex items-center gap-2 font-medium text-ink">
            <Mic className="size-4" /> Starta röst när Navet öppnas
          </span>
          <span className="mt-1 block">
            Gäller den installerade appen på den här enheten. Säg <strong className="text-ink">”Hey Google, öppna Navet”</strong>,
            prata in det du vill komma ihåg, så sparas det i inkorgen efter tre sekunder.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={greeting}
          onChange={(e) => setVoiceGreeting(e.target.checked)}
          className="mt-0.5 size-4 accent-[#2f5d4e]"
        />
        <span>
          <span className="flex items-center gap-2 font-medium text-ink">
            <Volume2 className="size-4" /> Säg att Navet är redo
          </span>
          <span className="mt-1 block">
            Navet säger <strong className="text-ink">”{READY_PROMPT}”</strong> innan den börjar lyssna.{" "}
            <button type="button" onClick={() => void speak(READY_PROMPT)} className="font-medium text-accent underline underline-offset-2">
              Lyssna
            </button>
          </span>
        </span>
      </label>
      <p>
        Du kan också hålla fingret på Navet-ikonen och välja <strong className="text-ink">Tala in</strong>, eller dra ut den
        genvägen till hemskärmen. Första gången frågar telefonen om lov att använda mikrofonen.
      </p>
    </Card>
  );
}
