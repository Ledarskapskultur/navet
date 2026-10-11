"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { AlertTriangle, ArrowRight, Check, Download, ExternalLink, Info, MessageSquare, Plug, Plus, RefreshCw, ThumbsUp, X } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, Card, EmptyState, Notice, PageHeader, Pill, SegmentedTabs, inputClass } from "@/components/ui";
import { useEngagement, type EngagementResponse } from "@/hooks/use-remote";
import { api } from "@/lib/client-api";
import { relativeTime } from "@/lib/dates";
import { SEGMENT_HINT, SEGMENT_LABEL } from "@/lib/integrations/linkedin/segments";
import { personInNavet, personToItem } from "@/lib/linkedin-leads";
import { LEAD_SEGMENTS, type EngagedPerson, type LeadSegment, type LinkedInPost } from "@/lib/types";

interface SyncResponse {
  ok: boolean;
  done: boolean;
  message: string;
  skipped?: boolean;
  busy?: boolean;
  remaining: number;
}

const SEGMENT_STYLE: Record<LeadSegment, string> = {
  yh: "bg-violet-soft text-violet",
  public: "bg-sky-soft text-sky",
  company: "bg-amber-soft text-amber",
  ugl: "bg-accent-soft text-accent-strong",
  other: "bg-subtle text-ink-3",
};

const PERIODS = [
  { value: "14", label: "14 dagar" },
  { value: "30", label: "30 dagar" },
  { value: "90", label: "90 dagar" },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const number = (n: number) => n.toLocaleString("sv-SE");

export default function LinkedInPage() {
  const [days, setDays] = useState("30");
  const { result, error, reload } = useEngagement(Number(days));
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);
  const [tab, setTab] = useState<"people" | "posts">("people");
  const [postFilter, setPostFilter] = useState<string | null>(null);
  const started = useRef(false);

  /**
   * A fetch can take several minutes, so the server does it in parts: each call works for a
   * while and says whether posts remain. `quiet` is the weekly fetch that starts by itself.
   */
  const sync = async (body: { auto?: boolean; postId?: string }, quiet = false) => {
    setBusy(quiet ? "Hämtar veckans statistik …" : "Hämtar …");
    if (!quiet) setOutcome(null);
    try {
      let last: SyncResponse | null = null;
      for (let i = 0; i < 60; i++) {
        last = await api<SyncResponse>("/api/linkedin/engagement/sync", { method: "POST", json: body });
        if (last.done) break;
        if (last.remaining) setBusy(`Hämtar … ${last.remaining} inlägg kvar`);
        if (last.busy) await wait(5000);
      }
      if (last && (!quiet || !last.ok) && !(quiet && last.skipped)) {
        setOutcome({ ok: last.ok, message: last.done ? last.message : "Hämtningen pågår fortfarande. Ladda om sidan om en stund." });
      }
      await reload();
    } catch (e) {
      if (!quiet) setOutcome({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  // Once per visit: start this week's fetch if it has not been made, or continue one that was interrupted.
  const due = result?.state === "ready" && (result.autoDue || result.running !== null);
  useEffect(() => {
    if (!due || started.current) return;
    started.current = true;
    void sync({ auto: true }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due]);

  const ready = result?.state === "ready" ? result : null;

  return (
    <div>
      <PageHeader
        title="LinkedIn"
        subtitle="Statistik för dina inlägg och vilka som gillar och kommenterar dem. Navet läser bara och skickar ingenting på LinkedIn."
        actions={
          ready ? (
            <>
              <SegmentedTabs value={days} onChange={setDays} options={PERIODS} />
              <Button onClick={() => sync({})} disabled={busy !== null}>
                <Download className={clsx("size-4", busy && "animate-pulse")} />
                {busy ?? (ready.lastRunAt ? "Hämta nu" : "Hämta statistik")}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-6 space-y-3">
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Kunde inte läsa statistiken: {error}
          </p>
        )}
        {result?.state === "locked" && (
          <Notice tone="muted" icon={<Plug className="size-4" />}>
            <strong className="font-semibold text-ink">Integrationer är avstängda tills Navet har ett lösenord.</strong>{" "}
            <Link href="/integrationer" className="font-medium text-accent underline underline-offset-2">
              Läs mer
            </Link>
          </Notice>
        )}
        {result?.state === "not_configured" && <SetupBox linkedinPosts={result.linkedinPosts} />}
        {ready?.configWarning && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-amber-soft px-4 py-3 text-sm text-amber">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {ready.configWarning}
          </p>
        )}
        {ready?.lastError && !outcome && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {ready.lastError}
          </p>
        )}
        {outcome && (
          <p
            role="status"
            className={clsx(
              "flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm",
              outcome.ok ? "border-accent/15 bg-accent-soft/60 text-accent-strong" : "border-warn/20 bg-warn-soft text-warn",
            )}
          >
            {outcome.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
            {outcome.message}
          </p>
        )}
        {ready?.notice && (
          <Notice tone="muted" icon={<Info className="size-4" />}>
            {ready.notice}
          </Notice>
        )}
      </div>

      {result === null && !error && <div className="h-64 animate-pulse rounded-2xl bg-sunken/60" />}

      {ready && (
        <>
          <Summary result={ready} busy={busy} />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs
              value={tab}
              onChange={setTab}
              options={[
                { value: "people", label: "Personer", count: ready.summary.people },
                { value: "posts", label: "Inlägg", count: ready.summary.posts },
              ]}
            />
          </div>

          {tab === "people" ? (
            <People result={ready} postFilter={postFilter} onClearPost={() => setPostFilter(null)} />
          ) : (
            <Posts
              result={ready}
              busy={busy !== null}
              onRefetch={(id) => sync({ postId: id })}
              onShowPeople={(id) => {
                setPostFilter(id);
                setTab("people");
              }}
              onAdded={async (id) => {
                await reload();
                await sync({ postId: id });
              }}
            />
          )}

          <p className="mt-8 flex items-start gap-2 text-sm leading-relaxed text-ink-3">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Dina inlägg hämtas via LinkedIns officiella API. Vilka som har gillat och kommenterat finns inte där, så den delen hämtas via
              tredjepartstjänsten Apify, som läser inläggens offentliga sidor. Det är inte LinkedIns API och omfattas inte av LinkedIns villkor.
              Visningar och räckvidd går inte att hämta alls och finns bara i LinkedIns egen statistik. Målgruppen bestäms av nyckelord i
              personens titel och kan bli fel.
            </span>
          </p>
        </>
      )}
    </div>
  );
}

function Summary({ result: r, busy }: { result: EngagementResponse; busy: string | null }) {
  const inTarget = r.summary.people - r.summary.bySegment.other;
  const tiles = [
    { label: "Inlägg", value: number(r.summary.posts) },
    { label: "Reaktioner", value: number(r.summary.reactions) },
    { label: "Kommentarer", value: number(r.summary.comments) },
    { label: "Personer", value: number(r.summary.people), sub: r.summary.people ? `${number(inTarget)} i dina målgrupper` : undefined },
  ];
  return (
    <div className="mb-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="px-4 py-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{t.value}</p>
            {t.sub && <p className="mt-0.5 text-xs text-ink-3">{t.sub}</p>}
          </Card>
        ))}
      </div>
      <p className="mt-3 text-sm text-ink-3" aria-live="polite">
        {busy ??
          (r.lastFinishedAt
            ? `Senaste ${r.days} dagarna · hämtad ${relativeTime(r.lastFinishedAt)} · hämtas automatiskt en gång i veckan för inlägg från de senaste ${r.windowDays} dagarna`
            : "Ingen statistik hämtad än.")}
      </p>
    </div>
  );
}

function People({ result: r, postFilter, onClearPost }: { result: EngagementResponse; postFilter: string | null; onClearPost: () => void }) {
  const [segment, setSegment] = useState<LeadSegment | "all">("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const post = postFilter ? r.posts.find((p) => p.id === postFilter) : undefined;
  const inPost = postFilter ? r.people.filter((p) => p.postIds.includes(postFilter)) : r.people;
  const shown = inPost.filter((p) => (segment === "all" || p.segment === segment) && (!onlyNew || p.isNew));
  const postById = new Map(r.posts.map((p) => [p.id, p]));
  const counts = (s: LeadSegment) => inPost.filter((p) => p.segment === s).length;

  if (!r.people.length) {
    return (
      <EmptyState
        title="Inga personer än"
        text={`När statistiken har hämtats visas de som gillat och kommenterat dina inlägg från de senaste ${r.days} dagarna här.`}
      />
    );
  }

  return (
    <>
      {post && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-subtle px-3 py-2 text-sm text-ink-2">
          <span className="min-w-0 flex-1 truncate">
            Visar personer för inlägget {post.text ? `”${post.text}”` : postDate(post)}
          </span>
          <button onClick={onClearPost} className="inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:underline">
            <X className="size-3.5" /> Visa alla
          </button>
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterPill active={segment === "all"} onClick={() => setSegment("all")}>
          Alla <span className="text-ink-3">{inPost.length}</span>
        </FilterPill>
        {LEAD_SEGMENTS.map((s) => (
          <FilterPill key={s} active={segment === s} onClick={() => setSegment(s)} title={SEGMENT_HINT[s]}>
            {SEGMENT_LABEL[s]} <span className="text-ink-3">{counts(s)}</span>
          </FilterPill>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
          Bara nya sedan förra hämtningen
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-ink-2">Ingen person matchar urvalet.</p>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {shown.map((p) => (
            <PersonRow key={p.id} person={p} post={postById.get(p.latestPostId)} />
          ))}
        </Card>
      )}
    </>
  );
}

function FilterPill({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={clsx(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm transition-colors",
        active ? "border-accent bg-accent-soft font-medium text-accent-strong" : "border-line bg-surface text-ink-2 hover:bg-subtle",
      )}
    >
      {children}
    </button>
  );
}

function interactions(p: EngagedPerson): string {
  const parts = [
    p.comments ? `kommenterade ${p.comments === 1 ? "1 gång" : `${p.comments} gånger`}` : "",
    p.likes ? `gillade ${p.likes === 1 ? "1 inlägg" : `${p.likes} inlägg`}` : "",
  ].filter(Boolean);
  const text = parts.join(" och ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function PersonRow({ person: p, post }: { person: EngagedPerson; post: LinkedInPost | undefined }) {
  const { items, createItem, notify } = useNavet();
  const already = personInNavet(p, items);

  const follow = async () => {
    const res = await createItem(personToItem(p, post));
    if (res) notify("Uppföljning skapad i inkorgen");
  };

  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[15px] font-medium text-ink">{p.name}</p>
          <Pill className={SEGMENT_STYLE[p.segment]} title={SEGMENT_HINT[p.segment]}>
            {SEGMENT_LABEL[p.segment]}
          </Pill>
          {p.isNew && <Pill className="border border-line text-ink-2">Ny</Pill>}
          {p.isContact && <Pill className="border border-line text-ink-3">Kontakt</Pill>}
        </div>
        {p.subtitle && <p className="mt-0.5 text-sm text-ink-2">{p.subtitle}</p>}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-3">
          {p.comments ? <MessageSquare className="size-3.5" /> : <ThumbsUp className="size-3.5" />}
          {interactions(p)}
          {p.postIds.length > 1 && ` · ${p.postIds.length} olika inlägg`}
        </p>
        {p.latestComment && <p className="mt-1.5 border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-ink-2">{p.latestComment}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {p.profileUrl && (
          <a
            href={p.profileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-subtle"
          >
            Profil <ExternalLink className="size-3.5" />
          </a>
        )}
        <Button size="sm" variant={already ? "ghost" : "primary"} onClick={follow} disabled={already}>
          {already ? (
            "Finns i Navet"
          ) : (
            <>
              Skapa uppföljning <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function postDate(p: LinkedInPost): string {
  return p.publishedAt ? format(new Date(p.publishedAt), "d MMM yyyy", { locale: sv }) : `tillagt ${format(new Date(p.addedAt), "d MMM yyyy", { locale: sv })}`;
}

function Posts({
  result: r,
  busy,
  onRefetch,
  onShowPeople,
  onAdded,
}: {
  result: EngagementResponse;
  busy: boolean;
  onRefetch: (id: string) => void;
  onShowPeople: (id: string) => void;
  onAdded: (id: string) => Promise<void>;
}) {
  return (
    <>
      {r.posts.length === 0 ? (
        <EmptyState
          title="Inga inlägg i perioden"
          text={
            r.linkedinPosts
              ? `Navet hittar inga inlägg från de senaste ${r.days} dagarna. LinkedIn kan dröja med att visa nya inlägg, och då kan du lägga till dem med länken nedan.`
              : "Lägg till ett inlägg genom att klistra in länken nedan."
          }
        />
      ) : (
        <div className="space-y-3">
          {r.posts.map((p) => (
            <PostCard key={p.id} post={p} busy={busy} onRefetch={() => onRefetch(p.id)} onShowPeople={() => onShowPeople(p.id)} />
          ))}
        </div>
      )}
      <AddPost disabled={busy} onAdded={onAdded} />
    </>
  );
}

function PostCard({ post: p, busy, onRefetch, onShowPeople }: { post: LinkedInPost; busy: boolean; onRefetch: () => void; onShowPeople: () => void }) {
  const s = p.stats;
  const fetched = s ? s.likersFetched + s.commentersFetched : 0;
  const count = (n: number | null | undefined) => (n === null || n === undefined ? "–" : number(n));
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-3">
        <span className="font-medium text-ink-2">{postDate(p)}</span>
        {p.source === "manual" && <Pill className="border border-line text-ink-3">Tillagt med länk</Pill>}
        <a href={p.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-accent underline underline-offset-2">
          Öppna på LinkedIn <ExternalLink className="size-3.5" />
        </a>
      </div>
      <p className={clsx("mt-2 text-[15px] leading-relaxed", p.text ? "text-ink" : "text-ink-3")}>{p.text ?? "Texten hämtas tillsammans med statistiken."}</p>

      {s ? (
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm sm:max-w-md">
          <Stat label="Reaktioner" value={count(s.reactions)} />
          <Stat label="Kommentarer" value={count(s.comments)} />
          <Stat label="Delningar" value={count(s.shares)} />
        </dl>
      ) : (
        <p className="mt-4 border-t border-line pt-4 text-sm text-ink-3">Ingen statistik hämtad för det här inlägget än.</p>
      )}
      {s?.error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {s.error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {fetched > 0 && (
          <Button size="sm" onClick={onShowPeople}>
            Visa {number(fetched)} {fetched === 1 ? "person" : "personer"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onRefetch} disabled={busy}>
          <RefreshCw className="size-3.5" /> {s ? "Hämta om" : "Hämta statistik"}
        </Button>
        {s && <span className="text-xs text-ink-3">Hämtad {relativeTime(s.fetchedAt)}</span>}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/** For when LinkedIn's own list has not caught up with a new post. */
function AddPost({ disabled, onAdded }: { disabled: boolean; onAdded: (id: string) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await api<{ post: LinkedInPost }>("/api/linkedin/posts", { method: "POST", json: { url: url.trim() } });
      setUrl("");
      await onAdded(res.post.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <form onSubmit={add} className="mt-6 rounded-2xl border border-dashed border-line-strong p-4">
      <label htmlFor="post-url" className="text-sm font-medium text-ink">
        Saknas ett inlägg?
      </label>
      <p className="mt-0.5 text-sm text-ink-3">
        Klistra in länken till ett av dina egna inlägg. Du hittar den under de tre prickarna på inlägget, Kopiera länk till inlägg.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="post-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.linkedin.com/posts/…"
          className={inputClass}
        />
        <Button type="submit" disabled={disabled || adding || !url.trim()}>
          <Plus className="size-4" /> {adding ? "Lägger till …" : "Lägg till och hämta"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-warn">
          {error}
        </p>
      )}
    </form>
  );
}

/** What has to be done outside Navet before statistics can be fetched. */
function SetupBox({ linkedinPosts }: { linkedinPosts: boolean }) {
  const code = "rounded bg-surface px-1.5 py-0.5 text-xs";
  return (
    <div className="rounded-2xl border border-amber/20 bg-amber-soft/60 px-4 py-3 text-sm text-ink-2">
      <p className="font-medium text-ink">Ej konfigurerad. Det här behövs innan statistiken kan hämtas:</p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5">
        <li>Skapa ett konto på apify.com. Gratisnivån ger kredit som räcker till ungefär 1 000 personer i månaden.</li>
        <li>
          Kopiera din token under Settings → API &amp; Integrations på apify.com. Den börjar med <code className={code}>apify_api_</code>.
        </li>
        <li>
          Lägg in den i miljövariabeln <code className={code}>APIFY_TOKEN</code> på servern (Vercel → Settings → Environment Variables,
          Production) och gör en ny deploy. Klistra aldrig in token någon annanstans.
        </li>
      </ol>
      <p className="mt-2 text-ink-3">
        Apify är en tredjepartstjänst som läser inläggens offentliga sidor. Det är inte LinkedIns officiella API och omfattas inte av LinkedIns
        villkor. {linkedinPosts ? "Listan över dina inlägg hämtas via LinkedIns officiella API." : "LINKEDIN_ACCESS_TOKEN saknas också, så inlägg läggs till med länk tills den finns."}
      </p>
    </div>
  );
}
