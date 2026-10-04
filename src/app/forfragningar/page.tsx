"use client";

import { useState } from "react";
import { CalendarDays, Check, Globe, Mail, MessageCircle, Phone, X } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, Card, EmptyState, PageHeader, ProjectBadge, SegmentedTabs, SourceBadge } from "@/components/ui";
import { STAGE_LABEL } from "@/lib/labels";
import { formatDue, relativeTime } from "@/lib/dates";
import { stagePatch } from "@/lib/request-stage";
import type { NavetItem, RequestStage } from "@/lib/types";

type Tab = "open" | RequestStage;

export default function RequestsPage() {
  const { items, projects, openCapture } = useNavet();
  const [tab, setTab] = useState<Tab>("open");
  const [project, setProject] = useState("");
  const requests = items
    .filter((i) => i.type === "request" && (!project || i.projectId === project))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const stageOf = (i: NavetItem): RequestStage => i.stage ?? "new";
  const open = requests.filter((i) => stageOf(i) === "new" || stageOf(i) === "answered");
  const shown = tab === "open" ? open : requests.filter((i) => stageOf(i) === tab);

  return (
    <div>
      <PageHeader
        title="Förfrågningar"
        subtitle="Bokningsförfrågningar från dina landningssidor och de du lägger in själv – från ny till bokad."
        actions={<Button variant="primary" onClick={() => openCapture("Förfrågan: ")}>+ Ny förfrågan</Button>}
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "open", label: "Att hantera", count: open.length },
            { value: "new", label: "Nya", count: requests.filter((i) => stageOf(i) === "new").length },
            { value: "answered", label: "Besvarade", count: requests.filter((i) => stageOf(i) === "answered").length },
            { value: "booked", label: "Bokade", count: requests.filter((i) => stageOf(i) === "booked").length },
            { value: "declined", label: "Avböjda", count: requests.filter((i) => stageOf(i) === "declined").length },
          ]}
        />
        <select
          className="h-9 rounded-xl border border-line bg-surface px-3 text-sm text-ink-2"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label="Projekt"
        >
          <option value="">Alla verksamheter</option>
          {projects.filter((p) => !p.archived).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={tab === "open" ? "Inga förfrågningar att hantera" : "Inget här"}
          text="Förfrågningar från formulären på dina landningssidor hamnar här automatiskt. DJ-bokningar kan du lägga in med + Ny förfrågan."
        />
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <RequestCard key={r.id} item={r} />
          ))}
        </div>
      )}
    </div>
  );
}

const STAGE_STYLE: Record<RequestStage, string> = {
  new: "bg-accent text-white",
  answered: "bg-amber-soft text-amber",
  booked: "bg-accent-soft text-accent-strong",
  declined: "bg-subtle text-ink-3",
};

function RequestCard({ item }: { item: NavetItem }) {
  const { updateItem, openItem, projectById, notify } = useNavet();
  const stage = item.stage ?? "new";
  const c = item.contact;
  const move = async (s: RequestStage) => {
    if (await updateItem(item.id, stagePatch(s))) notify(`Markerad som ${STAGE_LABEL[s].toLowerCase()}`);
  };
  const mailto = c?.email
    ? `mailto:${c.email}?subject=${encodeURIComponent(`Sv: ${item.title}`)}&body=${encodeURIComponent(`Hej ${c.name?.split(" ")[0] ?? ""},\n\nTack för din förfrågan!\n\n`)}`
    : null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button onClick={() => openItem(item)} className="min-w-0 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${STAGE_STYLE[stage]}`}>{STAGE_LABEL[stage]}</span>
            <ProjectBadge project={projectById(item.projectId)} />
            <span className="text-xs text-ink-3">{relativeTime(item.createdAt)}</span>
          </div>
          <p className="mt-2 text-[17px] font-medium leading-snug">{item.title}</p>
        </button>
        {item.eventDate && (
          <span className="flex items-center gap-1.5 rounded-xl bg-canvas px-3 py-1.5 text-sm text-ink-2">
            <CalendarDays className="size-4" /> {formatDue(item.eventDate)}
          </span>
        )}
      </div>

      {item.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-2">{item.description}</p>}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
        {c?.name && <span className="font-medium text-ink">{c.name}{c.organization ? `, ${c.organization}` : ""}</span>}
        {c?.email && (
          <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-ink">
            <Mail className="size-4" /> {c.email}
          </a>
        )}
        {c?.phone && (
          <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 hover:text-ink">
            <Phone className="size-4" /> {c.phone}
          </a>
        )}
        {item.origin && (
          <span className="flex items-center gap-1.5 text-ink-3">
            <Globe className="size-4" /> {item.origin.replace(/^https?:\/\//, "").slice(0, 60)}
          </span>
        )}
        <SourceBadge source={item.source} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        {mailto && stage === "new" && (
          <a
            href={mailto}
            onClick={() => void move("answered")}
            className="inline-flex h-8 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-white hover:bg-accent-strong"
          >
            <MessageCircle className="size-4" /> Svara via mail
          </a>
        )}
        {stage === "new" && (
          <Button size="sm" onClick={() => move("answered")}>Markera besvarad</Button>
        )}
        {stage !== "booked" && (
          <Button size="sm" onClick={() => move("booked")}>
            <Check className="size-4" /> Bokad
          </Button>
        )}
        {stage !== "declined" && stage !== "booked" && (
          <Button size="sm" variant="ghost" onClick={() => move("declined")}>
            <X className="size-4" /> Avböj
          </Button>
        )}
        {(stage === "booked" || stage === "declined") && (
          <Button size="sm" variant="ghost" onClick={() => move("answered")}>Öppna igen</Button>
        )}
      </div>
    </Card>
  );
}
