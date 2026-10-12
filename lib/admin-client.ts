"use client";

import type { FieldErrors } from "@/lib/catalog-core/schema";

export type AdminFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  errors?: FieldErrors;
  problems?: string[];
};

/**
 * JSON request to the admin API. A 401 (session expired) sends you to the
 * login page and back; every other failure comes back as a readable message.
 */
export async function adminRequest<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<({ ok: true } & T) | AdminFailure> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: json !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, code: "network", message: "Couldn't reach the dev server. Is `npm run dev` still running?" };
  }
  if (res.status === 401) {
    window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`);
    return { ok: false, status: 401, code: "unauthorized", message: "Please log in again." };
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) return { ok: false, status: res.status, code: "bad_response", message: `Unexpected response from the server (HTTP ${res.status}).` };
  if (res.ok && data.ok !== false) return data as { ok: true } & T;
  return {
    ok: false,
    status: res.status,
    code: String(data.code ?? "error"),
    message: String(data.message ?? "Something went wrong."),
    errors: data.errors as FieldErrors | undefined,
    problems: data.problems as string[] | undefined,
  };
}
