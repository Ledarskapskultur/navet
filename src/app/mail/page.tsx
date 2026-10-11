"use client";

import Link from "next/link";
import { ArrowRight, Flag, Plug, Sparkles } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, Card, Notice, PageHeader, Pill } from "@/components/ui";
import { ConnectNotice } from "@/components/connect-notice";
import { useFlaggedMail } from "@/hooks/use-remote";
import { interpretMail, mailAlreadyInNavet, mailToItem } from "@/lib/mail-interpret";
import { TYPE_LABEL } from "@/lib/labels";
import { formatDue, relativeTime } from "@/lib/dates";
import type { MailMessage } from "@/lib/types";

export default function MailPage() {
  const mail = useFlaggedMail();
  const mails = mail.data;
  return (
    <div>
      <PageHeader
        title="Mail att hantera"
        subtitle="Flaggade mail från Outlook blir förslag på uppgifter, åtaganden och idéer – du bestämmer vad som ska in i Navet."
      />
      <div className="mb-8">
        {mail.provider === "none" && mail.state !== "error" ? (
          <ConnectNotice state={mail.state} what="dina flaggade mejl" />
        ) : mail.error ? (
          <Notice icon={<Plug className="size-4" />}>
            <strong className="font-semibold">{mail.error}</strong>{" "}
            <Link href="/integrationer" className="underline underline-offset-2">Öppna Integrationer</Link>
          </Notice>
        ) : mail.provider === "outlook" ? (
          <Notice tone="muted" icon={<Flag className="size-4" />}>
            Dina flaggade mail i Outlook. När du har hanterat ett mail – ta bort flaggan i Outlook så försvinner det härifrån.
          </Notice>
        ) : mail.provider === "demo" ? (
          <Notice icon={<Plug className="size-4" />}>
            <strong className="font-semibold">Demoläge.</strong> Mejlen nedan är exempel och kommer inte från något konto.
          </Notice>
        ) : null}
      </div>
      <div className="space-y-4">
        {mails === null && <div className="h-48 animate-pulse rounded-2xl bg-sunken/60" />}
        {mails?.length === 0 && !mail.error && mail.provider !== "none" && (
          <p className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-ink-2">
            Inga flaggade mail just nu.
          </p>
        )}
        {mails?.map((m) => (
          <MailCard key={m.id} mail={m} />
        ))}
      </div>
    </div>
  );
}

function MailCard({ mail }: { mail: MailMessage }) {
  const { projects, projectById, createItem, notify, items } = useNavet();
  const ai = interpretMail(mail, projects);
  const project = projectById(ai.projectId);
  const already = mailAlreadyInNavet(mail, items);

  const create = async () => {
    const res = await createItem(mailToItem(mail, ai));
    if (res) notify("Skapad i inkorgen");
  };

  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-[1fr_340px]">
        <div className="p-5">
          <div className="flex items-center gap-2 text-sm">
            <Flag className="size-4 text-warn" />
            <span className="font-medium">{mail.from}</span>
            <span className="text-ink-3">· {relativeTime(mail.receivedAt)}</span>
          </div>
          <p className="mt-2 text-[17px] font-medium leading-snug">{mail.subject}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{mail.preview}</p>
          {mail.source === "demo" ? (
            <Pill className="mt-3 border border-line text-ink-3">Exempel</Pill>
          ) : mail.link ? (
            <a href={mail.link} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-accent underline underline-offset-2">
              Öppna i Outlook
            </a>
          ) : null}
        </div>
        <div className="border-t border-line bg-canvas/70 p-5 md:border-l md:border-t-0">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
            <Sparkles className="size-3.5" /> Navets tolkning
          </p>
          <dl className="space-y-2 text-sm">
            <Row label={TYPE_LABEL[ai.type]} value={ai.title} strong />
            <Row label="Deadline" value={ai.deadlineText ?? (ai.dueDate ? formatDue(ai.dueDate) : "–")} />
            <Row label="Projekt" value={project?.name ?? "–"} />
            <Row label="Källa" value="Outlook-mail" />
          </dl>
          <Button size="sm" variant={already ? "ghost" : "primary"} className="mt-4 w-full" onClick={create} disabled={already}>
            {already ? "Finns i Navet" : (<>Skapa i Navet <ArrowRight className="size-4" /></>)}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2">
      <dt className="text-ink-3">{label}</dt>
      <dd className={strong ? "font-medium text-ink" : "text-ink-2"}>{value}</dd>
    </div>
  );
}
