/**
 * Describes a source link the user chose to include with captured text.
 *
 * The link is only a reference for the reviewer ("open the original
 * conversation"). The server never fetches it — no scraping. Query strings and
 * fragments are dropped so tracking parameters are not stored.
 */
export type SourceUrl = {
  /** origin + path only */
  url: string;
  host: string;
  isReddit: boolean;
  subreddit: string | null;
};

const SUBREDDIT_NAME = /^[A-Za-z0-9_]{2,21}$/;

export function describeSourceUrl(raw: string | null | undefined): SourceUrl | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const host = parsed.hostname.toLowerCase();
  const isReddit =
    host === "reddit.com" || host.endsWith(".reddit.com") || host === "redd.it";

  let subreddit: string | null = null;
  if (isReddit) {
    const match = /^\/r\/([^/]+)/.exec(parsed.pathname);
    if (match?.[1] && SUBREDDIT_NAME.test(match[1])) subreddit = match[1];
  }

  return { url: `${parsed.origin}${parsed.pathname}`, host, isReddit, subreddit };
}
