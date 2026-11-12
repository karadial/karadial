import type { Bookmark } from '@/lib/karakeep/types';

import type { Cache, CachedBookmarks, CachedLists } from './db';

/**
 * Cache that lives only as long as the page.
 *
 * Stands in when IndexedDB is unavailable, so the speed dial still works
 * (without instant start) instead of failing.
 */
export function createMemoryCache(): Cache {
  let lists: CachedLists | null = null;
  const bookmarks = new Map<string, CachedBookmarks>();
  const images = new Map<string, Blob>();

  const prune = (map: Map<string, unknown>, keep: readonly string[]) => {
    const keepSet = new Set(keep);
    for (const key of [...map.keys()]) {
      if (!keepSet.has(key)) map.delete(key);
    }
  };

  return {
    getLists: async () => lists,
    putLists: async (value) => {
      lists = { lists: value, fetchedAt: Date.now() };
    },
    getBookmarks: async (listId) => bookmarks.get(listId) ?? null,
    putBookmarks: async (listId, value: Bookmark[]) => {
      bookmarks.set(listId, { bookmarks: value, fetchedAt: Date.now() });
    },
    pruneBookmarks: async (keep) => prune(bookmarks, keep),
    getImage: async (assetId) => images.get(assetId) ?? null,
    putImage: async (assetId, blob) => {
      images.set(assetId, blob);
    },
    pruneImages: async (keep) => prune(images, keep),
    clear: async () => {
      lists = null;
      bookmarks.clear();
      images.clear();
    },
    close: () => undefined,
  };
}
