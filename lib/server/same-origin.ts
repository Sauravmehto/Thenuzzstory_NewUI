import type { NextRequest } from "next/server";

/*
 * "Did this write come from our own pages?" — checked on top of SameSite cookies.
 *
 * Comparing the browser's Origin with `req.nextUrl.origin` is not enough behind a
 * proxy: on Netlify the function sees an internal URL, so a real request from
 * https://thenuzzstory.com looked cross-site and got a 403 (admin login,
 * checkout, sign-in, grooming booking all failed on the live site).
 *
 * Instead the Origin's host must equal a host this request was actually sent to
 * (Host / X-Forwarded-Host, which the browser and Netlify's edge set), or the
 * site's own URL that Netlify provides. A page on another site can't make the
 * browser send our host as its Origin, so this still blocks cross-site writes.
 */
export function isSameOrigin(req: Pick<NextRequest, "headers" | "nextUrl">): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    host = url.host.toLowerCase();
  } catch {
    return false;
  }
  return allowedHosts(req).has(host);
}

function allowedHosts(req: Pick<NextRequest, "headers" | "nextUrl">): Set<string> {
  const hosts = new Set<string>();
  const add = (value: string | null | undefined) => {
    for (const part of (value ?? "").split(",")) {
      const h = part.trim().toLowerCase();
      if (h) hosts.add(h);
    }
  };
  add(req.headers.get("x-forwarded-host"));
  add(req.headers.get("host"));
  add(req.nextUrl.host);
  // Netlify's own URLs for this site (primary domain, this deploy, branch deploy).
  for (const env of [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL, process.env.SITE_URL]) {
    if (!env) continue;
    try {
      add(new URL(env).host);
    } catch {
      /* not a URL: ignore */
    }
  }
  return hosts;
}
