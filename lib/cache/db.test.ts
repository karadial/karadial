import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Bookmark, KarakeepList } from '@/lib/karakeep/types';

import { deleteCache, openCache, type Cache } from './db';

const list: KarakeepList = { id: 'l1', name: 'Work', icon: '', parentId: null, type: 'manual' };

const bookmark = (id: string): Bookmark => ({
  id,
  kind: 'link',
  createdAt: '2026-01-01T00:00:00.000Z',
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

describe('cache', () => {
  let cache: Cache;

  beforeEach(async () => {
    cache = await openCache('https://keep.example.com');
  });

  afterEach(async () => {
    cache.close();
    await deleteCache();
  });

  it('starts empty', async () => {
    expect(await cache.getLists()).toBeNull();
    expect(await cache.getBookmarks('l1')).toBeNull();
    expect(await cache.getImage('a1')).toBeNull();
  });

  it('stores lists and bookmarks with a timestamp', async () => {
    const before = Date.now();
    await cache.putLists([list]);
    await cache.putBookmarks('l1', [bookmark('a'), bookmark('b')]);

    const lists = await cache.getLists();
    expect(lists?.lists).toEqual([list]);
    expect(lists?.fetchedAt).toBeGreaterThanOrEqual(before);
    expect((await cache.getBookmarks('l1'))?.bookmarks.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('stores image blobs', async () => {
    await cache.putImage('a1', new Blob(['bytes'], { type: 'image/png' }));
    expect(await cache.getImage('a1')).not.toBeNull();
  });

  it('prunes bookmarks and images that are no longer needed', async () => {
    await cache.putBookmarks('keep', [bookmark('a')]);
    await cache.putBookmarks('drop', [bookmark('b')]);
    await cache.putImage('keep', new Blob(['1']));
    await cache.putImage('drop', new Blob(['2']));

    await cache.pruneBookmarks(['keep']);
    await cache.pruneImages(['keep']);

    expect(await cache.getBookmarks('keep')).not.toBeNull();
    expect(await cache.getBookmarks('drop')).toBeNull();
    expect(await cache.getImage('keep')).not.toBeNull();
    expect(await cache.getImage('drop')).toBeNull();
  });

  it('survives reopening for the same instance', async () => {
    await cache.putLists([list]);
    cache.close();
    cache = await openCache('https://keep.example.com');
    expect((await cache.getLists())?.lists).toEqual([list]);
  });

  it('is wiped when opened for another instance', async () => {
    await cache.putLists([list]);
    await cache.putBookmarks('l1', [bookmark('a')]);
    await cache.putImage('a1', new Blob(['1']));
    cache.close();

    cache = await openCache('https://other.example.com');

    expect(await cache.getLists()).toBeNull();
    expect(await cache.getBookmarks('l1')).toBeNull();
    expect(await cache.getImage('a1')).toBeNull();
  });

  it('can be cleared', async () => {
    await cache.putLists([list]);
    await cache.clear();
    expect(await cache.getLists()).toBeNull();
  });
});
