"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Button, inputClass } from "@/components/ui";

function Unlock() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const next = params.get("next");
      // Full reload so the app starts fresh (and voice-on-launch can kick in).
      window.location.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      return;
    }
    setBusy(false);
    setError("Fel lösenord. Försök igen.");
  };

  return (
    <div className="flex min-h-[80dvh] items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-line bg-surface p-8 shadow-card">
        <span className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-accent text-white">
          <Lock className="size-5" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Navet</h1>
        <p className="mt-1 text-sm text-ink-2">Ange ditt lösenord. Du förblir inloggad på den här enheten.</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${inputClass} mt-6`}
          placeholder="Lösenord"
          aria-label="Lösenord"
        />
        {error && <p className="mt-2 text-sm text-warn">{error}</p>}
        <Button variant="primary" type="submit" className="mt-4 w-full" disabled={!password || busy}>
          {busy ? "Låser upp…" : "Lås upp"}
        </Button>
      </form>
    </div>
  );
}

export default function UnlockPage() {
  return (
    <Suspense>
      <Unlock />
    </Suspense>
  );
}
