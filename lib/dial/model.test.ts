import { describe, expect, it } from 'vitest';

import type { Bookmark, KarakeepList } from '@/lib/karakeep/types';

import { buildPages, imageAssetIds, listIdsForPages, toTile } from './model';

const list = (id: string, parentId: string | null = null): KarakeepList => ({
  id,
  name: id.toUpperCase(),
  icon: '',
  parentId,
  type: 'manual',
});

const bookmark = (id: string, overrides: Partial<Bookmark> = {}): Bookmark => ({
  id,
  kind: 'link',
  createdAt: '',
  title: `Title ${id}`,
  description: null,
  url: `https://www.example.com/${id}`,
  imageAssetId: null,
  screenshotAssetId: null,
  faviconUrl: null,
  archived: false,
  favourited: false,
  tags: [],
  ...overrides,
});

const lists = [list('work'), list('tools', 'work'), list('editors', 'tools'), list('home')];

describe('toTile', () => {
  it('builds a tile from a link bookmark', () => {
    expect(toTile(bookmark('a', { imageAssetId: 'img', screenshotAssetId: 'shot' }))).toEqual({
      id: 'a',
      url: 'https://www.example.com/a',
      title: 'Title a',
      host: 'example.com',
      imageAssetId: 'img',
    });
  });

  it('falls back to the screenshot and to the host as title', () => {
    const tile = toTile(bookmark('a', { title: '  ', screenshotAssetId: 'shot' }));
    expect(tile?.title).toBe('example.com');
    expect(tile?.imageAssetId).toBe('shot');
  });

  it.each([null, 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'not a url'])(
    'rejects the target %j',
    (url) => {
      expect(toTile(bookmark('a', { url }))).toBeNull();
    },
  );
});

describe('listIdsForPages', () => {
  it('returns each page list with all its descendants', () => {
    expect(listIdsForPages(lists, ['work'])).toEqual(['work', 'tools', 'editors']);
    expect(listIdsForPages(lists, ['home', 'tools'])).toEqual(['home', 'tools', 'editors']);
  });

  it('skips unknown pages and does not repeat lists', () => {
    expect(listIdsForPages(lists, ['gone', 'work', 'tools'])).toEqual(['work', 'tools', 'editors']);
  });
});

describe('buildPages', () => {
  const bookmarks = new Map([
    ['work', [bookmark('w1'), bookmark('note', { url: null })]],
    ['tools', [bookmark('t1')]],
    ['editors', [bookmark('e1'), bookmark('e2')]],
    ['home', []],
  ]);

  it('builds pages in the selected order with descendants as groups', () => {
    const pages = buildPages(lists, ['home', 'work'], bookmarks);

    expect(pages.map((p) => p.listId)).toEqual(['home', 'work']);
    expect(pages[0]).toMatchObject({ name: 'HOME', tiles: [], groups: [] });
    expect(pages[1]!.tiles.map((t) => t.id)).toEqual(['w1']);
    expect(pages[1]!.groups.map((g) => [g.name, g.tiles.map((t) => t.id)])).toEqual([
      ['TOOLS', ['t1']],
      ['TOOLS / EDITORS', ['e1', 'e2']],
    ]);
  });

  it('skips a selected list that no longer exists', () => {
    expect(buildPages(lists, ['gone', 'home'], bookmarks).map((p) => p.listId)).toEqual(['home']);
  });

  it('leaves out groups without tiles but keeps their children', () => {
    const sparse = new Map([['editors', [bookmark('e1')]]]);
    const [page] = buildPages(lists, ['work'], sparse);
    expect(page!.groups.map((g) => g.name)).toEqual(['TOOLS / EDITORS']);
  });
});

describe('imageAssetIds', () => {
  it('collects every image of pages and groups once', () => {
    const bookmarks = new Map([
      ['work', [bookmark('a', { imageAssetId: 'i1' }), bookmark('b', { imageAssetId: 'i1' })]],
      ['tools', [bookmark('c', { screenshotAssetId: 's1' }), bookmark('d')]],
    ]);
    expect(imageAssetIds(buildPages(lists, ['work'], bookmarks))).toEqual(['i1', 's1']);
  });
});
