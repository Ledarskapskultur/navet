import "server-only";
import { NextResponse } from "next/server";
import { GoogleApiError, GoogleAuthError } from "../integrations/google/types";
import { env, googleConfigured, outlookConfigured } from "./env";
import { getStore } from "./store";
import { loadMsConnection } from "../integrations/microsoft/connection";
import { NavetService, NotFoundError } from "./service";
import { clearSession, getContext } from "./session";
import type { AppStatus } from "../types";

/** Wraps a route handler: builds the per-request service and maps errors to JSON. */
export async function withService(fn: (svc: NavetService) => Promise<unknown>) {
  try {
    const ctx = await getContext();
    const svc = await NavetService.create(ctx);
    const result = await fn(svc);
    return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function errorResponse(err: unknown) {
  if (err instanceof GoogleAuthError) {
    await clearSession();
    return NextResponse.json({ error: err.message, code: "reauth" }, { status: 401 });
  }
  if (err instanceof NotFoundError) return NextResponse.json({ error: err.message, code: "not_found" }, { status: 404 });
  if (err instanceof GoogleApiError) {
    return NextResponse.json({ error: err.message, code: "google_error" }, { status: 502 });
  }
  console.error("[navet]", err);
  return NextResponse.json({ error: (err as Error)?.message ?? "Okänt fel", code: "error" }, { status: 500 });
}

export async function appStatus(svc: NavetService): Promise<AppStatus> {
  const ctx = await getContext();
  return {
    mode: ctx.mode,
    user: ctx.mode === "google" ? ctx.session.user : null,
    googleEnabled: ctx.mode !== "personal",
    passwordProtected: Boolean(env.appPassword),
    googleConfigured: googleConfigured(),
    outlookConfigured: outlookConfigured(),
    outlook: outlookConfigured() ? ((await loadMsConnection(await getStore()))?.account ?? null) : null,
    storage: svc.storageKind,
    storageDurable: svc.storageKind === "supabase" || !process.env.VERCEL,
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
