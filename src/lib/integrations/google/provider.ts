import "server-only";
import type { RequestContext } from "../../server/session";
import { writeSession } from "../../server/session";
import type { NavetStore } from "../../server/store";
import { refreshAccessToken } from "./oauth";
import { GoogleTasksClient } from "./tasks-client";
import { MockTasksProvider } from "./mock-tasks";
import { GoogleAuthError, type TasksProvider } from "./types";

/**
 * Returns the real Google Tasks client when logged in, the simulated one in demo
 * mode, and null in personal mode (Navet without Google).
 */
export function getTasksProvider(ctx: RequestContext, store: NavetStore): TasksProvider | null {
  if (ctx.mode === "personal") return null;
  if (ctx.mode === "demo") return new MockTasksProvider(store, ctx.userId);

  const session = ctx.session;
  return new GoogleTasksClient(async () => {
    if (session.google.expiresAt - 60_000 > Date.now()) return session.google.accessToken;
    if (!session.google.refreshToken) throw new GoogleAuthError();
    const t = await refreshAccessToken(session.google.refreshToken);
    session.google = {
      ...session.google,
      accessToken: t.access_token,
      expiresAt: Date.now() + t.expires_in * 1000,
      refreshToken: t.refresh_token ?? session.google.refreshToken,
    };
    await writeSession(session);
    return session.google.accessToken;
  });
}
