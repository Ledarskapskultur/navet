"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client-api";
import type { AppStatus, ItemPatch, NavetItem, NewItemInput, Project, SyncState } from "@/lib/types";

interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

interface NavetContextValue {
  ready: boolean;
  items: NavetItem[];
  projects: Project[];
  sync: SyncState | null;
  status: AppStatus | null;
  syncing: boolean;
  toasts: Toast[];
  projectById: (id: string | null) => Project | undefined;
  listName: (id: string | null) => string | null;
  refresh: () => Promise<void>;
  syncNow: (opts?: { silent?: boolean }) => Promise<void>;
  createItem: (item: NewItemInput, opts?: { syncToGoogle?: boolean; listId?: string | null }) => Promise<NavetItem | null>;
  updateItem: (id: string, patch: ItemPatch, opts?: { syncToGoogle?: boolean; listId?: string | null }) => Promise<NavetItem | null>;
  toggleDone: (item: NavetItem) => Promise<void>;
  deleteItem: (id: string, opts?: { deleteExternal?: boolean }) => Promise<void>;
  unlinkItem: (id: string) => Promise<void>;
  createProject: (name: string, description?: string) => Promise<Project | null>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setDefaultList: (listId: string) => Promise<void>;
  simulateVoice: (text: string) => Promise<void>;
  resetDemo: () => Promise<void>;
  logout: () => Promise<void>;
  // UI state
  captureOpen: boolean;
  openCapture: (initial?: string, opts?: { voice?: boolean }) => void;
  closeCapture: () => void;
  captureInitial: string;
  /** True when capture was opened hands-free (PWA shortcut / auto-start): listen at once and auto-save. */
  captureVoice: boolean;
  editing: NavetItem | null;
  openItem: (item: NavetItem) => void;
  closeItem: () => void;
  notify: (text: string, tone?: Toast["tone"]) => void;
}

const NavetContext = createContext<NavetContextValue | null>(null);

const AUTO_SYNC_MS = 2 * 60_000;

export function NavetProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<NavetItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureInitial, setCaptureInitial] = useState("");
  const [captureVoice, setCaptureVoice] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const syncRef = useRef<SyncState | null>(null);
  const syncingRef = useRef(false);
  syncRef.current = sync;

  const notify = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.code === "reauth") {
        notify("Google-inloggningen har gått ut. Logga in igen.", "error");
        setStatus((s) => (s ? { ...s, mode: "demo", user: null } : s));
        return;
      }
      notify((err as Error).message || "Något gick fel", "error");
    },
    [notify],
  );

  const refresh = useCallback(async () => {
    const data = await api<{ items: NavetItem[]; projects: Project[]; sync: SyncState; status: AppStatus }>("/api/bootstrap");
    setItems(data.items);
    setProjects(data.projects);
    setSync(data.sync);
    setStatus(data.status);
  }, []);

  const syncNow = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      try {
        const res = await api<{ state: SyncState; items: NavetItem[]; imported: number; updated: number; removed: number }>(
          "/api/sync",
          { method: "POST" },
        );
        setItems(res.items);
        setSync(res.state);
        if (!opts.silent || res.imported) {
          const parts = [];
          if (res.imported) parts.push(`${res.imported} nya`);
          if (res.updated) parts.push(`${res.updated} uppdaterade`);
          if (res.removed) parts.push(`${res.removed} borttagna`);
          notify(parts.length ? `Google Tasks: ${parts.join(", ")}` : "Synkad med Google Tasks");
        }
      } catch (err) {
        if (!opts.silent) handleError(err);
        else if (err instanceof ApiError && err.code === "reauth") handleError(err);
        setSync((s) => (s ? { ...s, lastError: (err as Error).message } : s));
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [handleError, notify],
  );

  // Initial load + auto-sync so tasks created via "Hey Google" show up.
  useEffect(() => {
    let cancelled = false;
    refresh()
      .then(() => {
        if (cancelled) return;
        setReady(true);
        const last = syncRef.current?.lastSyncAt;
        if (!last || Date.now() - Date.parse(last) > AUTO_SYNC_MS) void syncNow({ silent: true });
      })
      .catch((err) => {
        setReady(true);
        handleError(err);
      });
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const last = syncRef.current?.lastSyncAt;
      if (!last || Date.now() - Date.parse(last) > AUTO_SYNC_MS) void syncNow({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, syncNow, handleError]);

  const upsertLocal = (item: NavetItem) =>
    setItems((list) => (list.some((i) => i.id === item.id) ? list.map((i) => (i.id === item.id ? item : i)) : [item, ...list]));

  const createItem: NavetContextValue["createItem"] = async (item, opts = {}) => {
    try {
      const created = await api<NavetItem>("/api/items", { method: "POST", json: { item, ...opts } });
      upsertLocal(created);
      return created;
    } catch (err) {
      handleError(err);
      return null;
    }
  };

  const updateItem: NavetContextValue["updateItem"] = async (id, patch, opts = {}) => {
    const prev = items.find((i) => i.id === id);
    if (prev) upsertLocal({ ...prev, ...patch, updatedAt: new Date().toISOString() } as NavetItem);
    try {
      const updated = await api<NavetItem>(`/api/items/${id}`, { method: "PATCH", json: { patch, ...opts } });
      upsertLocal(updated);
      return updated;
    } catch (err) {
      if (prev) upsertLocal(prev);
      handleError(err);
      return null;
    }
  };

  const toggleDone = async (item: NavetItem) => {
    const done = item.status === "done";
    const res = await updateItem(item.id, { status: done ? (item.type === "waiting" ? "waiting" : "open") : "done" });
    if (res && !done) notify(item.externalProvider === "google_tasks" ? "Klar – även i Google Tasks" : "Markerad som klar");
  };

  const deleteItem: NavetContextValue["deleteItem"] = async (id, opts = {}) => {
    const prev = items;
    setItems((l) => l.filter((i) => i.id !== id));
    try {
      await api(`/api/items/${id}?external=${opts.deleteExternal === false ? 0 : 1}`, { method: "DELETE" });
      notify("Raderad");
    } catch (err) {
      setItems(prev);
      handleError(err);
    }
  };

  const unlinkItem = async (id: string) => {
    try {
      upsertLocal(await api<NavetItem>(`/api/items/${id}`, { method: "PATCH", json: { unlink: true } }));
    } catch (err) {
      handleError(err);
    }
  };

  const createProject = async (name: string, description?: string) => {
    try {
      const p = await api<Project>("/api/projects", { method: "POST", json: { name, description } });
      setProjects((l) => [...l, p]);
      return p;
    } catch (err) {
      handleError(err);
      return null;
    }
  };

  const updateProject = async (id: string, patch: Partial<Project>) => {
    try {
      const p = await api<Project>(`/api/projects/${id}`, { method: "PATCH", json: patch });
      setProjects((l) => l.map((x) => (x.id === id ? p : x)));
    } catch (err) {
      handleError(err);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((l) => l.filter((x) => x.id !== id));
      setItems((l) => l.map((i) => (i.projectId === id ? { ...i, projectId: null } : i)));
    } catch (err) {
      handleError(err);
    }
  };

  const setDefaultList = async (listId: string) => {
    try {
      setSync(await api<SyncState>("/api/google/default-list", { method: "PUT", json: { listId } }));
    } catch (err) {
      handleError(err);
    }
  };

  const simulateVoice = async (text: string) => {
    try {
      const res = await api<{ items: NavetItem[]; state: SyncState; imported: number }>("/api/demo/voice", {
        method: "POST",
        json: { text },
      });
      setItems(res.items);
      setSync(res.state);
      notify("Google Tasks fick en ny uppgift – synkad till Navets inkorg");
    } catch (err) {
      handleError(err);
    }
  };

  const resetDemo = async () => {
    try {
      await api("/api/demo/reset", { method: "POST" });
      await refresh();
      await syncNow({ silent: true });
      notify("Demodata återställd");
    } catch (err) {
      handleError(err);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await refresh();
    router.push("/");
  };

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const listMap = useMemo(() => new Map((sync?.lists ?? []).map((l) => [l.id, l.title])), [sync]);

  const editing = editingId ? (items.find((i) => i.id === editingId) ?? null) : null;

  const value: NavetContextValue = {
    ready,
    items,
    projects,
    sync,
    status,
    syncing,
    toasts,
    projectById: (id) => (id ? projectMap.get(id) : undefined),
    listName: (id) => (id ? (listMap.get(id) ?? null) : null),
    refresh,
    syncNow,
    createItem,
    updateItem,
    toggleDone,
    deleteItem,
    unlinkItem,
    createProject,
    updateProject,
    deleteProject,
    setDefaultList,
    simulateVoice,
    resetDemo,
    logout,
    captureOpen,
    captureInitial,
    captureVoice,
    openCapture: (initial = "", opts) => {
      setCaptureInitial(initial);
      setCaptureVoice(!!opts?.voice);
      setCaptureOpen(true);
    },
    closeCapture: () => setCaptureOpen(false),
    editing,
    openItem: (item) => setEditingId(item.id),
    closeItem: () => setEditingId(null),
    notify,
  };

  return <NavetContext.Provider value={value}>{children}</NavetContext.Provider>;
}

export function useNavet() {
  const ctx = useContext(NavetContext);
  if (!ctx) throw new Error("useNavet must be used inside NavetProvider");
  return ctx;
}
