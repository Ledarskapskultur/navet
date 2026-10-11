// Shared (client + server) description of an integration. Every external service Navet
// talks to is presented through this shape, so the Integrationer page, the start page and
// a future AI assistant all read the same thing.

export const INTEGRATION_IDS = ["outlook_mail", "outlook_calendar", "linkedin"] as const;
export type IntegrationId = (typeof INTEGRATION_IDS)[number];

export type IntegrationProvider = "microsoft" | "linkedin";

/**
 * not_configured – the server lacks client id/secret (app registration not done)
 * locked         – Navet is public without APP_PASSWORD, integrations are switched off
 * disconnected   – configured, but no account is connected
 * connected      – works
 * needs_reauth   – the stored token was rejected; the user has to connect again
 * error          – connected, but the last call failed for another reason
 */
export type IntegrationState = "not_configured" | "locked" | "disconnected" | "connected" | "needs_reauth" | "error";

export interface IntegrationPermission {
  /** The provider's own name, e.g. "Mail.Read" or "w_member_social" */
  scope: string;
  label: string;
  /** What Navet uses it for */
  purpose: string;
  granted: boolean;
  /** base = asked for when connecting, optional = asked for when the feature is switched on */
  level: "base" | "optional";
  /** Scope group to request (see MS_SCOPE_GROUPS), when the user can grant it from the card */
  grant?: string;
}

/**
 * active            – works now
 * needs_permission  – built, but the user has to grant one more permission
 * planned           – part of a later phase, not built yet
 * unavailable       – the official API does not offer it
 */
export type CapabilityStatus = "active" | "needs_permission" | "planned" | "unavailable";

export interface IntegrationCapability {
  id: string;
  label: string;
  status: CapabilityStatus;
  /**
   * read = only fetches information. write = sends, publishes, changes or deletes something
   * and must always be approved by the user (also when an AI assistant asks for it).
   */
  effect: "read" | "write";
  note?: string;
}

export interface IntegrationStatus {
  id: IntegrationId;
  name: string;
  provider: IntegrationProvider;
  description: string;
  state: IntegrationState;
  /** False while the connection itself is not built yet */
  available: boolean;
  availabilityNote?: string;
  account: { name: string; email: string } | null;
  connectedAt: string | null;
  /** Last time Navet successfully fetched data through this integration */
  lastSyncAt: string | null;
  lastError: string | null;
  permissions: IntegrationPermission[];
  capabilities: IntegrationCapability[];
  /** Where "Anslut konto" goes, or null when connecting is not possible right now */
  connectUrl: string | null;
  /**
   * True when the account can be disconnected from the card. LinkedIn cannot: its token is a
   * setting on the server, so it is removed there.
   */
  canDisconnect: boolean;
  /** True when the card can fetch the integration's data again on request (LinkedIn contacts) */
  canSync: boolean;
  /** Number of records fetched through the integration and stored in Navet, when it keeps any */
  storedCount: number | null;
  /** Something worth knowing that is not an error, e.g. that the provider is still preparing data */
  notice: string | null;
  /** Environment variables that are still missing on the server */
  missingConfig: string[];
  /** A setting that is present but looks wrong (e.g. a Secret ID pasted as the client secret) or is about to expire */
  configWarning: string | null;
  /** The redirect URI to register with the provider */
  redirectUri: string;
}

export const STATE_LABEL: Record<IntegrationState, string> = {
  not_configured: "Ej konfigurerad",
  locked: "Avstängd",
  disconnected: "Ej ansluten",
  connected: "Ansluten",
  needs_reauth: "Behöver anslutas igen",
  error: "Fel",
};
