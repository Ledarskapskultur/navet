"use client";

import Link from "next/link";
import { Plug } from "lucide-react";
import type { IntegrationState } from "@/lib/integrations/types";
import { Notice } from "./ui";

/** Shown instead of data when an integration isn't connected. Navet never fills the gap with sample data. */
export function ConnectNotice({ state, what, extra }: { state: IntegrationState | null; what: string; extra?: string }) {
  const text =
    state === "needs_reauth"
      ? "Anslutningen till Outlook har gått ut."
      : state === "not_configured"
        ? "Outlook är inte konfigurerat än."
        : state === "locked"
          ? "Integrationer är avstängda tills Navet har ett lösenord."
          : "Outlook är inte anslutet.";
  const action = state === "needs_reauth" ? "Anslut igen" : state === "not_configured" ? "Se vad som saknas" : state === "locked" ? "Läs mer" : "Anslut konto";
  return (
    <Notice tone="muted" icon={<Plug className="size-4" />}>
      <strong className="font-semibold text-ink">{text}</strong> Inget visas här förrän kontot är anslutet, så att du alltid ser {what} och aldrig
      exempel. {extra}{" "}
      <Link href="/integrationer" className="font-medium text-accent underline underline-offset-2">
        {action}
      </Link>
    </Notice>
  );
}
