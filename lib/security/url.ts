/**
 * Returns true only for absolute `http:` and `https:` URLs.
 *
 * Bookmark URLs are untrusted input. Anything else (`javascript:`, `data:`,
 * `file:`, relative URLs and so on) must never become a clickable link.
 */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}
