"use client";

import { useState } from "react";
import { ArrowDown, Mic, RefreshCw } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { ItemList } from "@/components/item-row";
import { Button, Card, Notice, PageHeader, Section, inputClass } from "@/components/ui";
import { GoogleTasksIcon } from "@/components/icons";
import { byNewest } from "@/lib/selectors";

const steps = [
  { title: "”Hey Google” / Gemini", text: "Säg till exempel: ”Hey Google, påminn mig att skicka brevet till Anna idag.”", icon: <Mic className="size-5" /> },
  { title: "Google Tasks", text: "Gemini sparar påminnelsen som en uppgift i Google Tasks – med datum.", icon: <GoogleTasksIcon className="size-5" /> },
  { title: "Navet", text: "Navet hämtar nya uppgifter automatiskt när du öppnar appen (och när du trycker på Synka nu). De landar i Inkorgen.", icon: <span className="size-3 rounded-full border-[2.5px] border-white" />, accent: true },
  { title: "Projekt · uppgift · åtagande · idé", text: "Du sorterar i Inkorgen. Navet föreslår typ och projekt utifrån orden. Klar-markering och ändringar skickas tillbaka till Google.", icon: <span className="text-sm font-semibold">✓</span> },
];

export default function VoicePage() {
  const { items, status, simulateVoice, syncNow, syncing } = useNavet();
  const [text, setText] = useState("Påminn mig att skicka brevet till Anna idag");
  const fromGoogle = items.filter((i) => i.source === "google_tasks").sort(byNewest).slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Röst & Google"
        subtitle="Fånga saker med rösten var du än är. Google Tasks fungerar som brevlåda – Navet är där du tar hand om dem."
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="space-y-0">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Card className={s.accent ? "border-accent/30 p-5" : "p-5"}>
                <div className="flex gap-4">
                  <span
                    className={
                      s.accent
                        ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white"
                        : "flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink-2"
                    }
                  >
                    {s.icon}
                  </span>
                  <div>
                    <p className="font-semibold">{s.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.text}</p>
                  </div>
                </div>
              </Card>
              {i < steps.length - 1 && (
                <div className="flex justify-center py-2 text-ink-3">
                  <ArrowDown className="size-5" />
                </div>
              )}
            </li>
          ))}
        </ol>

        <div>
          <Section title={status?.mode === "demo" ? "Prova flödet (demo)" : "Prova flödet"}>
            {status?.mode === "demo" ? (
              <Card className="p-5">
                <p className="mb-3 text-sm text-ink-2">
                  Simulera att du pratar med Google. Uppgiften skapas i demo-Google Tasks och synkas sedan in i Navet.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (text.trim()) await simulateVoice(text.trim());
                  }}
                  className="space-y-3"
                >
                  <div className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm text-ink-3">
                    <Mic className="size-4" /> ”Hey Google,
                    <input value={text} onChange={(e) => setText(e.target.value)} className={`${inputClass} h-9 flex-1`} />”
                  </div>
                  <Button variant="primary" type="submit" className="w-full">
                    Skicka till Google Tasks → Navet
                  </Button>
                </form>
              </Card>
            ) : (
              <Card className="space-y-3 p-5 text-sm leading-relaxed text-ink-2">
                <p>
                  1. På din Android: säg <strong className="text-ink">”Hey Google, påminn mig att …”</strong> eller be Gemini
                  ”lägg till … i Google Tasks”.
                </p>
                <p>2. Öppna Navet – nya uppgifter hämtas automatiskt (äldre än 2 minuter sedan senaste synk).</p>
                <Button onClick={() => syncNow()} disabled={syncing}>
                  <RefreshCw className="size-4" /> Synka nu
                </Button>
              </Card>
            )}
          </Section>

          <Notice tone="muted">
            Tips: Lägg Navet på hemskärmen (Chrome-menyn → <em>Installera app</em>) så har du både röst och Navet ett tryck bort.
          </Notice>
        </div>
      </div>

      <Section title="Senast från Google Tasks" count={fromGoogle.length} className="mt-12">
        <ItemList items={fromGoogle} empty={<p className="text-sm text-ink-3">Inget har kommit från Google Tasks ännu.</p>} />
      </Section>
    </div>
  );
}
