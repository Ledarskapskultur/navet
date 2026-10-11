import "server-only";

/**
 * Thin client for Apify (apify.com), a third-party service that runs scrapers ("actors").
 * Navet uses it for one thing LinkedIn's official API does not offer: who liked and commented
 * on the owner's own posts. The actors read the posts' public pages without any LinkedIn login.
 * This is not LinkedIn's API and is not covered by LinkedIn's terms, which the interface says.
 * The same actors and inputs as the linkedin-engager-analytics skill.
 */
const BASE = "https://api.apify.com/v2";
const ENGAGERS_ACTOR = "scraping_solutions~linkedin-posts-engagers-likers-and-commenters-no-cookies";
const POST_ACTOR = "apimaestro~linkedin-post-detail";
/** A run that takes longer than this is given up. The actor may still finish and be billed. */
const TIMEOUT_MS = 110_000;

/** The token is missing or no longer accepted. */
export class ApifyAuthError extends Error {
  constructor(message = "Apify godkänner inte token. Skapa en ny under Settings → API & Integrations på apify.com, byt APIFY_TOKEN och gör en ny deploy.") {
    super(message);
  }
}

export class ApifyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function describe(status: number): string {
  if (status === 402) return "Apify-krediten är slut för den här månaden. Hämtningen fortsätter när krediten fylls på, eller när du uppgraderar kontot hos Apify.";
  if (status === 403) return "Apify-kontot får inte köra den här hämtaren. Kontrollera kontot på apify.com.";
  if (status === 404) return "Apify hittar inte hämtaren. Den kan ha bytt namn eller tagits bort, och Navet behöver då uppdateras.";
  if (status === 408 || status === 504) return "Apify hann inte svara i tid. Försök igen om en stund.";
  if (status === 429) return "Apify begränsar antalet anrop just nu. Försök igen om en stund.";
  if (status >= 500) return "Apify svarar inte just nu. Försök igen om en stund.";
  return `Apify svarade med fel ${status}.`;
}

export type ApifyRow = Record<string, unknown>;

/** Runs an actor and waits for its result. The token goes in a header, never in the address. */
async function runActor(token: string, actor: string, input: Record<string, unknown>): Promise<ApifyRow[]> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/acts/${actor}/run-sync-get-dataset-items`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if ((err as Error)?.name === "TimeoutError") throw new ApifyError(408, describe(408));
    throw new ApifyError(0, "Kunde inte nå Apify. Kontrollera anslutningen och försök igen.");
  }
  if (res.status === 401) throw new ApifyAuthError();
  if (!res.ok) throw new ApifyError(res.status, describe(res.status));
  const data = (await res.json().catch(() => null)) as unknown;
  if (!Array.isArray(data)) return [];
  // Some actors append a run summary or an error object next to the real rows.
  return data.filter((r): r is ApifyRow => typeof r === "object" && r !== null && !Array.isArray(r) && !("summary" in r));
}

export type EngagerKind = "likers" | "commenters";

/** The people who liked or commented on a post, as the actor returns them. One billed run per call. */
export function fetchPostEngagers(token: string, postUrl: string, kind: EngagerKind, limit: number): Promise<ApifyRow[]> {
  return runActor(token, ENGAGERS_ACTOR, { urls: [postUrl], resultsLimit: limit, type: kind });
}

export interface PostTotals {
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  text: string | null;
  postedAt: string | null;
}

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Total reactions, comments and shares for a post. Null when the post cannot be read (private or removed). */
export async function fetchPostTotals(token: string, postUrl: string): Promise<PostTotals | null> {
  const [raw] = await runActor(token, POST_ACTOR, { post_urls: [postUrl] });
  if (!raw) return null;
  const post = (raw.post ?? {}) as ApifyRow;
  const stats = (raw.stats ?? {}) as ApifyRow;
  const author = (raw.author ?? {}) as ApifyRow;
  if (!str(post.text) && !str(author.name)) return null;
  return {
    reactions: count(stats.total_reactions),
    comments: count(stats.comments),
    shares: count(stats.shares),
    text: str(post.text),
    postedAt: str(post.created_at),
  };
}
