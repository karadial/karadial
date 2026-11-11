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

export type InstanceUrlError = 'empty' | 'invalid' | 'scheme' | 'credentials';

export type InstanceUrlResult =
  { ok: true; baseUrl: string } | { ok: false; reason: InstanceUrlError };

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Normalizes what the user typed as Karakeep instance URL.
 *
 * The result has no trailing slash, query, fragment or `/api/v1` suffix, so the
 * API client can append `/api/v1/...` to it. A missing scheme defaults to https.
 */
export function parseInstanceUrl(input: string): InstanceUrlResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };

  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'scheme' };
  }
  if (url.hostname === '') return { ok: false, reason: 'invalid' };
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'credentials' };
  }

  const path = url.pathname.replace(/\/+$/, '').replace(/\/api(\/v1)?$/i, '');
  return { ok: true, baseUrl: url.origin + path };
}

/**
 * Match pattern for the optional host permission of an instance.
 *
 * Firefox match patterns do not support ports, so the pattern covers the host
 * on every port.
 */
export function hostPermissionPattern(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

const LOCAL_SUFFIXES = ['.localhost', '.local', '.lan', '.internal', '.home.arpa'];

/** True for loopback, private network and link-local hosts and for local-only names. */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host.startsWith('[') && host.endsWith(']')) {
    const v6 = host.slice(1, -1);
    // loopback, unique local fc00::/7, link-local fe80::/10
    return v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
  }

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }

  if (host === 'localhost' || !host.includes('.')) return true;
  return LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** True when the instance is reached over plain http on a non-local address. */
export function isInsecureRemote(baseUrl: string): boolean {
  const url = new URL(baseUrl);
  return url.protocol === 'http:' && !isLocalHost(url.hostname);
}
