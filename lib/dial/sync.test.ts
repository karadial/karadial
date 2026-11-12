import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteCache, openCache, type Cache } from '@/lib/cache/db';
import type { KarakeepClient } from '@/lib/karakeep/client';
import { KarakeepError } from '@/lib/karakeep/errors';
import type { Bookmark, KarakeepList } from '@/lib/karakeep/types';

import { loadFromCache, refreshFromServer } from './sync';

const list = (id: string, parentId: string | null = null): KarakeepList => ({
  id,
  name: id,
  icon: '',
  parentId,
  type: 'manual',
});

const bookmark = (id: string): Bookmark => ({
  id,
  kind: 'link',
  createdAt: '',
  title: id,
  description: null,
  url: `https://example.com/${id}`,
  imageAssetId: null,
  screenshotAssetId: null,
  faviconUrl: null,
  archived: false,
  favourited: false,
  tags: [],
});

const lists = [list('work'), list('tools', 'work'), list('home'), list('other')];

function fakeClient(overrides: Partial<KarakeepClient> = {}): KarakeepClient {
  return {
    testConnection: vi.fn(),
    listLists: vi.fn(async () => lists),
    listBookmarksPage: vi.fn(),
    listAllBookmarks: vi.fn(async (listId: string) => [bookmark(`${listId}-1`)]),
    searchBookmarks: vi.fn(),
    getAsset: vi.fn(),
    ...overrides,
  };
}

describe('dial sync', () => {
  let cache: Cache;

  beforeEach(async () => {
    cache = await openCache('https://keep.example.com');
  });

  afterEach(async () => {
    cache.close();
    await deleteCache();
  });

  it('loads nothing from an empty cache', async () => {
    expect(await loadFromCache(cache, ['work'])).toEqual({
      lists: [],
      bookmarks: new Map(),
      fetchedAt: null,
    });
  });

  it('fetches only the lists the pages need and caches them', async () => {
    const client = fakeClient();

    const data = await refreshFromServer(client, cache, ['work', 'home']);

    expect([...data.bookmarks.keys()]).toEqual(['work', 'tools', 'home']);
    expect(client.listAllBookmarks).toHaveBeenCalledTimes(3);

    const cached = await loadFromCache(cache, ['work', 'home']);
    expect(cached.lists).toEqual(lists);
    expect([...cached.bookmarks.keys()]).toEqual(['work', 'tools', 'home']);
    expect(cached.bookmarks.get('tools')).toEqual([bookmark('tools-1')]);
    expect(cached.fetchedAt).not.toBeNull();
  });

  it('drops cached bookmarks of lists that are no longer shown', async () => {
    await refreshFromServer(fakeClient(), cache, ['work', 'home']);
    await refreshFromServer(fakeClient(), cache, ['home']);
    expect(await cache.getBookmarks('work')).toBeNull();
    expect(await cache.getBookmarks('home')).not.toBeNull();
  });

  it('skips a list that vanished on the server', async () => {
    const client = fakeClient({
      listAllBookmarks: vi.fn(async (listId: string) => {
        if (listId === 'tools') throw new KarakeepError('not-found', 404);
        return [bookmark(listId)];
      }),
    });
    const data = await refreshFromServer(client, cache, ['work']);
    expect([...data.bookmarks.keys()]).toEqual(['work']);
  });

  it('keeps the cache when the server is unreachable', async () => {
    await refreshFromServer(fakeClient(), cache, ['work']);
    const offline = fakeClient({
      listLists: vi.fn(async () => {
        throw new KarakeepError('network');
      }),
    });

    await expect(refreshFromServer(offline, cache, ['work'])).rejects.toMatchObject({
      kind: 'network',
    });
    expect((await loadFromCache(cache, ['work'])).bookmarks.size).toBe(2);
  });

  it('keeps the cache when a list fails for another reason', async () => {
    await refreshFromServer(fakeClient(), cache, ['work']);
    const failing = fakeClient({
      listAllBookmarks: vi.fn(async () => {
        throw new KarakeepError('unauthorized', 401);
      }),
    });

    await expect(refreshFromServer(failing, cache, ['work'])).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect((await cache.getBookmarks('tools'))?.bookmarks).toEqual([bookmark('tools-1')]);
  });
});
