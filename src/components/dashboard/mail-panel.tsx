"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ExternalLink, Flag, ListPlus, Paperclip } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { ConnectNotice } from "@/components/connect-notice";
import { Card, Section, SegmentedTabs } from "@/components/ui";
import type { RemoteSummary } from "@/hooks/use-remote";
import { relativeTime } from "@/lib/dates";
import { interpretMail, mailAlreadyInNavet, mailToItem } from "@/lib/mail-interpret";
import type { MailMessage } from "@/lib/types";

type Tab = "important" | "flagged" | "latest";

const EMPTY: Record<Tab, string> = {
  important: "Inga mejl markerade med hög prioritet de senaste 30 dagarna.",
  flagged: "Inga flaggade mejl. Flagga ett mejl i Outlook så dyker det upp här.",
  latest: "Inkorgen är tom.",
};

/** Outlook: viktiga, flaggade och senaste inkomna mejl. */
export function MailPanel({ mail, className }: { mail: RemoteSummary; className?: string }) {
  const [tab, setTab] = useState<Tab>("latest");
  const live = mail.provider === "outlook" || mail.provider === "demo";
  const s = mail.summary;
  const list = s ? s[tab] : [];

  return (
    <Section
      className={className}
      title="Outlook"
      action={
        live ? (
          <Link href="/mail" className="flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
            Mail att hantera <ArrowRight className="size-4" />
          </Link>
        ) : undefined
      }
    >
      {mail.provider === null ? (
        <div className="h-48 animate-pulse rounded-2xl bg-sunken/60" />
      ) : !live ? (
        mail.state === "error" ? (
          <p role="alert" className="rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
            {mail.error ?? "Kunde inte hämta mejl just nu."}{" "}
            <Link href="/integrationer" className="font-medium underline underline-offset-2">
              Öppna Integrationer
            </Link>
          </p>
        ) : (
          <ConnectNotice state={mail.state} what="dina riktiga mejl" />
        )
      ) : (
        <>
          <div className="mb-3">
            <SegmentedTabs
              value={tab}
              onChange={setTab}
              options={[
                { value: "latest", label: "Senaste" },
                { value: "flagged", label: "Flaggade", count: s?.flaggedCount ?? undefined },
                { value: "important", label: "Viktiga", count: s?.important.length },
              ]}
            />
          </div>
          {mail.error && (
            <p role="alert" className="mb-3 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
              {mail.error}
            </p>
          )}
          <Card className="overflow-hidden">
            {list.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-2">{mail.error ? "Inget att visa." : EMPTY[tab]}</p>
            ) : (
              list.map((m) => <MailRow key={m.id} mail={m} />)
            )}
          </Card>
          {mail.provider === "demo" && <p className="mt-2 px-1 text-xs text-ink-3">Demoläge: mejlen är exempel och kommer inte från något konto.</p>}
        </>
      )}
    </Section>
  );
}

function MailRow({ mail }: { mail: MailMessage }) {
  const { projects, items, createItem, notify } = useNavet();
  const [busy, setBusy] = useState(false);
  const already = mailAlreadyInNavet(mail, items);
  const unread = mail.isRead === false;

  const toTask = async () => {
    setBusy(true);
    const res = await createItem(mailToItem(mail, interpretMail(mail, projects)));
    setBusy(false);
    if (res) notify("Uppgift skapad i inkorgen");
  };

  return (
    <div className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span className={clsx("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-accent" : "bg-transparent")} aria-label={unread ? "Oläst" : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-sm">
          <span className={clsx("truncate", unread ? "font-semibold text-ink" : "font-medium text-ink")}>{mail.from}</span>
          {mail.flagged && <Flag className="size-3.5 shrink-0 self-center text-warn" aria-label="Flaggat" />}
          {mail.hasAttachments && <Paperclip className="size-3.5 shrink-0 self-center text-ink-3" aria-label="Har bilaga" />}
          <span className="ml-auto shrink-0 text-xs text-ink-3">{relativeTime(mail.receivedAt)}</span>
        </div>
        <p className={clsx("truncate text-[15px] leading-snug", unread ? "font-medium text-ink" : "text-ink")}>{mail.subject}</p>
        <p className="truncate text-sm text-ink-3">{mail.preview}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {already ? (
            <span className="text-ink-3">Finns i Navet</span>
          ) : (
            <button onClick={toTask} disabled={busy} className="inline-flex items-center gap-1 text-accent hover:underline disabled:opacity-50">
              <ListPlus className="size-4" /> Skapa uppgift
            </button>
          )}
          {mail.link && (
            <a href={mail.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">
              Öppna i Outlook <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
