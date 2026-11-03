"use client";

import { useRef, useState, type FormEvent } from "react";

export default function AdminLogin({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (res.ok && data?.ok) {
        window.location.assign(next);
        return;
      }
      setError(data?.message ?? "Couldn't log in.");
    } catch {
      setError("Couldn't reach the server.");
    }
    setBusy(false);
    setPassword("");
    inputRef.current?.focus();
  };

  return (
    <main className="admin-login">
      <h1>The Nuzz Story admin</h1>
      <form onSubmit={submit} noValidate>
        <label htmlFor="admin-password">Password</label>
        <input
          ref={inputRef}
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "admin-login-error" : undefined}
          required
          autoFocus
        />
        {error && (
          <p id="admin-login-error" className="admin-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="admin-btn admin-btn--primary" disabled={busy || !password}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
