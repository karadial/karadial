import { KarakeepError } from './errors';

export interface KarakeepClientOptions {
  /** Normalized instance URL without trailing slash. */
  baseUrl: string;
  apiKey: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface KarakeepClient {
  /** Checks that the instance answers and the API key may read lists. */
  testConnection(): Promise<{ listCount: number }>;
}

const API_PREFIX = '/api/v1';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The only module that talks to the network.
 *
 * The API key is sent to the configured instance origin only. Redirects are
 * not followed, so the key cannot leak to another origin.
 */
export function createKarakeepClient(options: KarakeepClientOptions): KarakeepClient {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const origin = new URL(options.baseUrl).origin;

  async function getJson(path: string): Promise<unknown> {
    const url = new URL(options.baseUrl + API_PREFIX + path);
    if (url.origin !== origin) throw new KarakeepError('network');

    let response: Response;
    try {
      response = await doFetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json' },
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      throw new KarakeepError(timedOut ? 'timeout' : 'network');
    }

    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new KarakeepError('redirect');
    }
    if (response.status === 401) throw new KarakeepError('unauthorized', 401);
    if (response.status === 403) throw new KarakeepError('forbidden', 403);
    if (response.status === 404) throw new KarakeepError('not-found', 404);
    if (!response.ok) throw new KarakeepError('http', response.status);

    try {
      return await response.json();
    } catch {
      throw new KarakeepError('invalid-response', response.status);
    }
  }

  return {
    async testConnection() {
      // GET /lists is what KaraDial needs first, so it doubles as permission check.
      const body = await getJson('/lists');
      const lists = (body as { lists?: unknown } | null)?.lists;
      if (!Array.isArray(lists)) throw new KarakeepError('invalid-response', 200);
      return { listCount: lists.length };
    },
  };
}
