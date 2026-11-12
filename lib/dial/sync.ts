import type { Cache } from '@/lib/cache/db';
import type { KarakeepClient } from '@/lib/karakeep/client';
import { KarakeepError } from '@/lib/karakeep/errors';
import type { Bookmark, KarakeepList } from '@/lib/karakeep/types';

import { listIdsForPages } from './model';

export interface DialData {
  lists: KarakeepList[];
  bookmarks: Map<string, Bookmark[]>;
  /** Time of the oldest piece of data, `null` when nothing is cached. */
  fetchedAt: number | null;
}

/** Reads what the cache has for the given pages. Never touches the network. */
export async function loadFromCache(
  cache: Cache,
  pageListIds: readonly string[],
): Promise<DialData> {
  const cachedLists = await cache.getLists();
  if (!cachedLists) return { lists: [], bookmarks: new Map(), fetchedAt: null };

  const bookmarks = new Map<string, Bookmark[]>();
  let fetchedAt = cachedLists.fetchedAt;
  for (const listId of listIdsForPages(cachedLists.lists, pageListIds)) {
    const cached = await cache.getBookmarks(listId);
    if (!cached) continue;
    bookmarks.set(listId, cached.bookmarks);
    fetchedAt = Math.min(fetchedAt, cached.fetchedAt);
  }
  return { lists: cachedLists.lists, bookmarks, fetchedAt };
}

/** Cached data younger than this is shown without asking the server again. */
export const MAX_AGE_MS = 60_000;

/**
 * True when the data should be refreshed: nothing cached, too old, or the
 * page selection needs lists the data does not have.
 */
export function needsRefresh(
  data: DialData,
  pageListIds: readonly string[],
  now: number = Date.now(),
): boolean {
  if (data.fetchedAt === null || now - data.fetchedAt > MAX_AGE_MS) return true;
  if (pageListIds.some((id) => !data.lists.some((list) => list.id === id))) return true;
  return listIdsForPages(data.lists, pageListIds).some((id) => !data.bookmarks.has(id));
}

const CONCURRENCY = 3;

/**
 * Fetches lists and the bookmarks of every list the pages need, and stores
 * them in the cache.
 *
 * A list that disappeared on the server between the two steps is skipped.
 * Any other server failure rejects, the cache then keeps what it had.
 * Failing cache writes are ignored.
 */
export async function refreshFromServer(
  client: KarakeepClient,
  cache: Cache,
  pageListIds: readonly string[],
  signal?: AbortSignal,
): Promise<DialData> {
  const lists = await client.listLists({ signal });
  // A full or broken cache must not keep fresh data from being shown.
  await cache.putLists(lists).catch(() => undefined);

  const listIds = listIdsForPages(lists, pageListIds);
  const bookmarks = new Map<string, Bookmark[]>();
  const queue = [...listIds];

  const worker = async () => {
    for (let listId = queue.shift(); listId !== undefined; listId = queue.shift()) {
      try {
        const result = await client.listAllBookmarks(listId, { signal });
        bookmarks.set(listId, result);
        await cache.putBookmarks(listId, result).catch(() => undefined);
      } catch (error) {
        if (!(error instanceof KarakeepError) || error.kind !== 'not-found') throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await cache.pruneBookmarks(listIds).catch(() => undefined);
  // Map insertion order follows completion order; restore list order.
  const ordered = new Map(
    listIds.filter((id) => bookmarks.has(id)).map((id) => [id, bookmarks.get(id)!]),
  );
  return { lists, bookmarks: ordered, fetchedAt: Date.now() };
}
