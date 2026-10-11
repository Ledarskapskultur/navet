// Microsoft Graph permissions, grouped by what the user switches on. Navet starts with
// read access and asks for more only when a feature needs it (incremental consent).
// Pure module – used by the server and by tests, no secrets.

export type MsFeature = "mail" | "calendar";

/** Needed for every connection: sign-in, profile and a refresh token. */
export const MS_BASE_SCOPES = ["openid", "profile", "offline_access", "User.Read"] as const;

export interface MsScopeGroup {
  scopes: string[];
  feature: MsFeature;
  label: string;
  purpose: string;
  level: "base" | "optional";
  /**
   * False until the feature that needs the permission is built. Navet never asks for a
   * permission it does not use yet (least privilege).
   */
  available: boolean;
  /** Which phase of the build switches the group on */
  phase: number;
}

export const MS_SCOPE_GROUPS = {
  mail_read: {
    scopes: ["Mail.Read"],
    feature: "mail",
    label: "Läsa mejl",
    purpose: "Visa inkorgen, olästa och flaggade mejl samt mejltrådar.",
    level: "base",
    available: true,
    phase: 1,
  },
  mail_write: {
    scopes: ["Mail.ReadWrite"],
    feature: "mail",
    label: "Ändra mejl",
    purpose: "Flagga och avflagga mejl samt spara utkast.",
    level: "optional",
    available: false,
    phase: 2,
  },
  mail_send: {
    scopes: ["Mail.Send"],
    feature: "mail",
    label: "Skicka mejl",
    purpose: "Skicka ett mejl när du har godkänt det.",
    level: "optional",
    available: false,
    phase: 2,
  },
  calendar_read: {
    scopes: ["Calendars.Read"],
    feature: "calendar",
    label: "Läsa kalendern",
    purpose: "Visa möten, mötesinformation och lediga tider.",
    level: "base",
    available: true,
    phase: 1,
  },
  calendar_write: {
    scopes: ["Calendars.ReadWrite"],
    feature: "calendar",
    label: "Ändra i kalendern",
    purpose: "Skapa, flytta och avboka möten, bjuda in deltagare och skapa Teams-möten.",
    level: "optional",
    available: false,
    phase: 3,
  },
} as const satisfies Record<string, MsScopeGroup>;

export type MsScopeGroupId = keyof typeof MS_SCOPE_GROUPS;

export const MS_SCOPE_GROUP_IDS = Object.keys(MS_SCOPE_GROUPS) as MsScopeGroupId[];

/** What a first connection from each card asks for. */
export const MS_DEFAULT_GRANT: Record<MsFeature, MsScopeGroupId> = { mail: "mail_read", calendar: "calendar_read" };

/** The permissions Navet had before scopes were tracked (connections saved by older versions). */
export const MS_LEGACY_SCOPES = ["User.Read", "Calendars.Read", "Mail.Read"];

/** A broader permission that also covers the narrower one. */
const IMPLIED_BY: Record<string, string[]> = {
  "Mail.Read": ["Mail.ReadWrite"],
  "Calendars.Read": ["Calendars.ReadWrite"],
};

const OIDC = new Set(["openid", "profile", "email", "offline_access"]);

/**
 * Microsoft returns scopes as a space separated string, sometimes with the resource in
 * front ("https://graph.microsoft.com/Mail.Read"). Returns the Graph permission names only.
 */
export function normalizeMsScopes(scope: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(scope) ? scope : (scope ?? "").split(/\s+/);
  const out = new Set<string>();
  for (const raw of parts) {
    const name = raw.trim().replace(/^https:\/\/graph\.microsoft\.com\//i, "");
    if (!name || OIDC.has(name.toLowerCase()) || name.startsWith("https://")) continue;
    out.add(name);
  }
  return [...out].sort();
}

export function hasMsScope(granted: string[], needed: string): boolean {
  const have = new Set(granted.map((s) => s.toLowerCase()));
  return have.has(needed.toLowerCase()) || (IMPLIED_BY[needed] ?? []).some((s) => have.has(s.toLowerCase()));
}

export function hasMsGroup(granted: string[], group: MsScopeGroupId): boolean {
  return MS_SCOPE_GROUPS[group].scopes.every((s) => hasMsScope(granted, s));
}

/**
 * Parses "mail_read,calendar_read" from a query string. Unknown groups, and groups whose
 * feature is not built yet, are dropped.
 */
export function parseMsGrant(value: string | null | undefined): MsScopeGroupId[] {
  const ids = (value ?? "").split(",").map((s) => s.trim());
  return MS_SCOPE_GROUP_IDS.filter((id) => ids.includes(id) && MS_SCOPE_GROUPS[id].available);
}

/**
 * The full scope list for an authorization request: the base scopes, what is already
 * granted (so nothing is lost when adding one more permission) and the new groups.
 */
export function msScopesForRequest(alreadyGranted: string[], groups: MsScopeGroupId[]): string[] {
  const out = new Set<string>(MS_BASE_SCOPES);
  for (const s of alreadyGranted) out.add(s);
  for (const g of groups) for (const s of MS_SCOPE_GROUPS[g].scopes) out.add(s);
  return [...out];
}

/** Which features a set of requested groups switches on, given what was actually granted. */
export function msFeaturesFor(groups: MsScopeGroupId[], granted: string[]): MsFeature[] {
  const out = new Set<MsFeature>();
  for (const g of groups) if (hasMsGroup(granted, g)) out.add(MS_SCOPE_GROUPS[g].feature);
  return [...out];
}

/** Which feature a Graph permission belongs to (null for the shared ones such as User.Read). */
export function msScopeFeature(scope: string): MsFeature | null {
  for (const id of MS_SCOPE_GROUP_IDS) {
    const g: MsScopeGroup = MS_SCOPE_GROUPS[id];
    if (g.scopes.some((s) => s.toLowerCase() === scope.toLowerCase())) return g.feature;
  }
  return null;
}

/**
 * The permissions Navet actually uses: everything granted except what belongs to a part
 * that is switched off. Used for token refresh, so a disconnected part's permission is
 * dropped from the access token Navet holds.
 */
export function msScopesInUse(granted: string[], features: Record<MsFeature, boolean>): string[] {
  return granted.filter((s) => {
    const feature = msScopeFeature(s);
    return feature === null || features[feature];
  });
}
