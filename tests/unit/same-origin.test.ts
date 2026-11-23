import { afterEach, describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/server/same-origin";

/** A request as the route handler sees it: headers plus the URL Next built for it. */
function req(url: string, headers: Record<string, string>) {
  return { headers: new Headers(headers), nextUrl: new URL(url) } as unknown as Parameters<typeof isSameOrigin>[0];
}

describe("isSameOrigin", () => {
  afterEach(() => {
    delete process.env.URL;
  });

  it("accepts the live site behind Netlify, where the function sees an internal URL", () => {
    // The bug: nextUrl was not https://thenuzzstory.com, so this got a 403.
    const r = req("http://localhost:8888/api/admin/session", {
      origin: "https://thenuzzstory.com",
      host: "thenuzzstory.com",
      "x-forwarded-host": "thenuzzstory.com",
    });
    expect(isSameOrigin(r)).toBe(true);
  });

  it("accepts the site URL Netlify provides even if the Host header is internal", () => {
    process.env.URL = "https://thenuzzstory.com";
    expect(isSameOrigin(req("http://127.0.0.1:3000/api/orders", { origin: "https://thenuzzstory.com", host: "127.0.0.1:3000" }))).toBe(true);
  });

  it("accepts local development", () => {
    expect(isSameOrigin(req("http://localhost:3000/api/orders", { origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
  });

  it("blocks another site, a missing Origin and junk", () => {
    const base = { host: "thenuzzstory.com", "x-forwarded-host": "thenuzzstory.com" };
    expect(isSameOrigin(req("https://thenuzzstory.com/api/orders", { ...base, origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(req("https://thenuzzstory.com/api/orders", { ...base, origin: "https://thenuzzstory.com.evil.example" }))).toBe(false);
    expect(isSameOrigin(req("https://thenuzzstory.com/api/orders", base))).toBe(false);
    expect(isSameOrigin(req("https://thenuzzstory.com/api/orders", { ...base, origin: "null" }))).toBe(false);
    expect(isSameOrigin(req("https://thenuzzstory.com/api/orders", { ...base, origin: "file://thenuzzstory.com" }))).toBe(false);
  });
});
