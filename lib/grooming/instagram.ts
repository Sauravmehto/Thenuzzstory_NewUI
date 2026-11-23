/**
 * Instagram Reel / post links → the shortcode we store. Only instagram.com
 * links are accepted, and only the shortcode is kept: embed and "open on
 * Instagram" URLs are rebuilt by us, so no admin-entered URL ever reaches an
 * iframe src as-is.
 */
const URL_RE = /^https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]{5,40})\/?(?:[?#].*)?$/;

export function parseInstagramUrl(input: string): { kind: "reel" | "p"; shortcode: string } | null {
  const m = URL_RE.exec(input.trim());
  if (!m) return null;
  return { kind: m[1] === "p" ? "p" : "reel", shortcode: m[2]! };
}

export const instagramPermalink = (kind: "reel" | "p", shortcode: string) => `https://www.instagram.com/${kind}/${shortcode}/`;

/** Instagram's public embed page (the one its own embed code loads). Loaded only after a click. */
export const instagramEmbedUrl = (kind: "reel" | "p", shortcode: string) => `https://www.instagram.com/${kind}/${shortcode}/embed/`;
