import { KarakeepError } from './errors';
import { parseBookmarkPage, parseLists } from './parse';
import type { Bookmark, BookmarkPage, KarakeepList } from './types';

export interface KarakeepClientOptions {
  /** Normalized instance URL without trailing slash. */
  baseUrl: string;
  apiKey: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface RequestOptions {
  /** Cancels the request, for example when a newer search replaces it. */
  signal?: AbortSignal;
}

export interface PageOptions extends RequestOptions {
  cursor?: string | null;
  limit?: number;
}

export interface KarakeepClient {
  /** Checks that the instance answers and the API key may read lists. */
  testConnection(): Promise<{ listCount: number }>;
  /** All lists of the user, manual and smart, flat. Nesting is in `parentId`. */
  listLists(options?: RequestOptions): Promise<KarakeepList[]>;
  /** One page of a list's bookmarks, newest first. */
  listBookmarksPage(listId: string, options?: PageOptions): Promise<BookmarkPage>;
  /** All bookmarks of a list, following the cursor until the end. */
  listAllBookmarks(listId: string, options?: RequestOptions): Promise<Bookmark[]>;
  /** Server side search across the whole collection, using Karakeep's query language. */
  searchBookmarks(query: string, options?: PageOptions): Promise<BookmarkPage>;
  /** Downloads an asset (preview image, screenshot) with the API key. */
  getAsset(assetId: string, options?: RequestOptions): Promise<Blob>;
}

const API_PREFIX = '/api/v1';
const DEFAULT_TIMEOUT_MS = 10_000;
/** Page size for bookmark requests. The spec states no maximum. */
export const PAGE_SIZE = 50;
/** Upper bound for `listAllBookmarks`, so a broken cursor cannot loop forever. */
export const MAX_PAGES = 100;

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

  async function request(
    path: string,
    query: Record<string, string | undefined>,
    accept: string,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const url = new URL(options.baseUrl + API_PREFIX + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    if (url.origin !== origin) throw new KarakeepError('network');

    const timeout = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await doFetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${options.apiKey}`, Accept: accept },
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      // A caller's own cancellation is not a failure of the instance.
      if (signal?.aborted) throw signal.reason;
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
    return response;
  }

  async function getJson(
    path: string,
    query: Record<string, string | undefined>,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const response = await request(path, query, 'application/json', signal);
    try {
      return await response.json();
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw new KarakeepError('invalid-response', response.status);
    }
  }

  const pageQuery = (page: PageOptions | undefined) => ({
    limit: String(page?.limit ?? PAGE_SIZE),
    cursor: page?.cursor ?? undefined,
    includeContent: 'false',
  });

  async function listLists(requestOptions?: RequestOptions) {
    return parseLists(await getJson('/lists', {}, requestOptions?.signal));
  }

  async function listBookmarksPage(listId: string, page?: PageOptions) {
    const path = `/lists/${encodeURIComponent(listId)}/bookmarks`;
    return parseBookmarkPage(await getJson(path, pageQuery(page), page?.signal));
  }

  return {
    async testConnection() {
      // GET /lists is what KaraDial needs first, so it doubles as permission check.
      return { listCount: (await listLists()).length };
    },

    listLists,
    listBookmarksPage,

    async listAllBookmarks(listId, requestOptions) {
      const all: Bookmark[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await listBookmarksPage(listId, { cursor, signal: requestOptions?.signal });
        all.push(...result.bookmarks);
        cursor = result.nextCursor;
        if (cursor === null || seenCursors.has(cursor)) break;
        seenCursors.add(cursor);
      }
      return all;
    },

    async searchBookmarks(query, page) {
      const body = await getJson(
        '/bookmarks/search',
        { q: query, ...pageQuery(page) },
        page?.signal,
      );
      return parseBookmarkPage(body);
    },

    async getAsset(assetId, requestOptions) {
      const path = `/assets/${encodeURIComponent(assetId)}`;
      const response = await request(path, {}, '*/*', requestOptions?.signal);
      try {
        return await response.blob();
      } catch {
        if (requestOptions?.signal?.aborted) throw requestOptions.signal.reason;
        throw new KarakeepError('invalid-response', response.status);
      }
    },
  };
}
