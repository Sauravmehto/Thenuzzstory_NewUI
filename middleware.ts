import { NextResponse, type NextRequest } from "next/server";

/*
 * A path with a doubled slash (https://thenuzzstory.com//admin/login) breaks
 * the client router: "//admin/login" reads as a protocol-relative URL
 * ("https://admin/login"), so history.replaceState throws a SecurityError and
 * the page dies. Collapse repeated slashes with a permanent redirect before
 * anything renders. Query strings are kept.
 */
export function middleware(request: NextRequest) {
  // Read the raw path: nextUrl may already be normalised.
  const raw = new URL(request.url);
  const path = rawPath(request.url) ?? raw.pathname;
  if (!path.includes("//")) return NextResponse.next();

  const clean = new URL(request.nextUrl.href);
  clean.pathname = path.replace(/\/{2,}/g, "/");
  return NextResponse.redirect(clean, 308);
}

/** The path exactly as sent, before any URL parser tidies it. */
function rawPath(url: string): string | null {
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i.exec(url);
  return m ? m[1] || "/" : null;
}

export const config = {
  // Skip Next's own assets; every page and API route is checked.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
