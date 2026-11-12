import type { Bookmark, KarakeepList } from '@/lib/karakeep/types';

/**
 * IndexedDB cache for lists, bookmarks and image blobs.
 *
 * The cache belongs to one Karakeep instance. Opening it for another instance
 * wipes it, so data of two servers never mixes.
 */
export interface Cache {
  getLists(): Promise<CachedLists | null>;
  putLists(lists: KarakeepList[]): Promise<void>;
  getBookmarks(listId: string): Promise<CachedBookmarks | null>;
  putBookmarks(listId: string, bookmarks: Bookmark[]): Promise<void>;
  /** Removes cached bookmarks of every list not in `keepListIds`. */
  pruneBookmarks(keepListIds: readonly string[]): Promise<void>;
  getImage(assetId: string): Promise<Blob | null>;
  putImage(assetId: string, blob: Blob): Promise<void>;
  /** Removes every cached image not in `keepAssetIds`. */
  pruneImages(keepAssetIds: readonly string[]): Promise<void>;
  clear(): Promise<void>;
  close(): void;
}

export interface CachedLists {
  lists: KarakeepList[];
  fetchedAt: number;
}

export interface CachedBookmarks {
  bookmarks: Bookmark[];
  fetchedAt: number;
}

const DB_NAME = 'karadial';
const DB_VERSION = 1;
const META = 'meta';
const BOOKMARKS = 'bookmarks';
const IMAGES = 'images';
const STORES = [META, BOOKMARKS, IMAGES] as const;

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    for (const store of STORES) {
      if (!request.result.objectStoreNames.contains(store)) {
        request.result.createObjectStore(store);
      }
    }
  };
  return wrap(request);
}

/** Opens the cache for the instance at `baseUrl`. */
export async function openCache(baseUrl: string): Promise<Cache> {
  const db = await openDatabase();

  const read = <T>(store: string, key: string): Promise<T | null> =>
    wrap(db.transaction(store).objectStore(store).get(key)).then((value) => (value as T) ?? null);

  const write = (store: string, key: string, value: unknown): Promise<void> => {
    const transaction = db.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value, key);
    return done(transaction);
  };

  const prune = async (store: string, keep: readonly string[]): Promise<void> => {
    const keepSet = new Set(keep);
    const transaction = db.transaction(store, 'readwrite');
    const objectStore = transaction.objectStore(store);
    const keys = await wrap(objectStore.getAllKeys());
    for (const key of keys) {
      if (!keepSet.has(String(key))) objectStore.delete(key);
    }
    return done(transaction);
  };

  const clear = (): Promise<void> => {
    const transaction = db.transaction(STORES, 'readwrite');
    for (const store of STORES) transaction.objectStore(store).clear();
    return done(transaction);
  };

  if ((await read<string>(META, 'instance')) !== baseUrl) {
    await clear();
    await write(META, 'instance', baseUrl);
  }

  return {
    getLists: () => read<CachedLists>(META, 'lists'),
    putLists: (lists) => write(META, 'lists', { lists, fetchedAt: Date.now() }),
    getBookmarks: (listId) => read<CachedBookmarks>(BOOKMARKS, listId),
    putBookmarks: (listId, bookmarks) =>
      write(BOOKMARKS, listId, { bookmarks, fetchedAt: Date.now() }),
    pruneBookmarks: (keepListIds) => prune(BOOKMARKS, keepListIds),
    getImage: (assetId) => read<Blob>(IMAGES, assetId),
    putImage: (assetId, blob) => write(IMAGES, assetId, blob),
    pruneImages: (keepAssetIds) => prune(IMAGES, keepAssetIds),
    clear,
    close: () => db.close(),
  };
}

/** Deletes the whole cache database, for example when the connection is removed. */
export function deleteCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
