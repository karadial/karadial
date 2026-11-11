import { describe, expect, it } from 'vitest';

import { KarakeepError } from './errors';
import { parseBookmarkPage, parseLists } from './parse';

describe('parseLists', () => {
  it('reduces API lists to the fields KaraDial uses', () => {
    const lists = parseLists({
      lists: [
        {
          id: 'l1',
          name: 'Work',
          description: null,
          icon: '💼',
          parentId: null,
          type: 'manual',
          query: null,
          public: false,
          hasCollaborators: false,
          userRole: 'owner',
        },
        {
          id: 'l2',
          name: 'Unread',
          icon: '📚',
          parentId: 'l1',
          type: 'smart',
          query: '-is:archived',
        },
      ],
    });

    expect(lists).toEqual([
      { id: 'l1', name: 'Work', icon: '💼', parentId: null, type: 'manual' },
      { id: 'l2', name: 'Unread', icon: '📚', parentId: 'l1', type: 'smart' },
    ]);
  });

  it('defaults a missing type to manual and drops broken entries', () => {
    const lists = parseLists({
      lists: [
        { id: 'l1', name: 'A' },
        { id: 'l2' },
        { name: 'no id' },
        null,
        'x',
        { id: 7, name: 'n' },
      ],
    });
    expect(lists).toEqual([{ id: 'l1', name: 'A', icon: '', parentId: null, type: 'manual' }]);
  });

  it.each([null, [], 'text', {}, { lists: {} }])('rejects the body %j', (body) => {
    expect(() => parseLists(body)).toThrow(KarakeepError);
  });
});

describe('parseBookmarkPage', () => {
  const base = { createdAt: '2026-01-01T00:00:00.000Z', archived: false, favourited: true };

  it('parses a link bookmark', () => {
    const page = parseBookmarkPage({
      bookmarks: [
        {
          ...base,
          id: 'b1',
          title: null,
          tags: [{ id: 't1', name: 'news', attachedBy: 'ai' }, { id: 't2' }],
          content: {
            type: 'link',
            url: 'https://example.com/article',
            title: 'Crawled title',
            description: 'About things',
            imageUrl: 'https://example.com/og.png',
            imageAssetId: 'img1',
            screenshotAssetId: 'shot1',
            favicon: 'https://example.com/favicon.ico',
            htmlContent: '<script>alert(1)</script>',
          },
        },
      ],
      nextCursor: 'next',
    });

    expect(page).toEqual({
      nextCursor: 'next',
      bookmarks: [
        {
          id: 'b1',
          kind: 'link',
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Crawled title',
          description: 'About things',
          url: 'https://example.com/article',
          imageAssetId: 'img1',
          screenshotAssetId: 'shot1',
          faviconUrl: 'https://example.com/favicon.ico',
          archived: false,
          favourited: true,
          tags: ['news'],
        },
      ],
    });
  });

  it('prefers the user title over the crawled title', () => {
    const { bookmarks } = parseBookmarkPage({
      bookmarks: [
        { ...base, id: 'b1', title: 'Mine', content: { type: 'link', url: 'u', title: 'Theirs' } },
      ],
      nextCursor: null,
    });
    expect(bookmarks[0]!.title).toBe('Mine');
  });

  it('parses text and asset bookmarks', () => {
    const { bookmarks } = parseBookmarkPage({
      bookmarks: [
        {
          ...base,
          id: 't',
          content: { type: 'text', text: 'note', sourceUrl: 'https://src.test' },
        },
        {
          ...base,
          id: 'i',
          content: { type: 'asset', assetType: 'image', assetId: 'a1', fileName: 'cat.png' },
        },
        {
          ...base,
          id: 'p',
          content: { type: 'asset', assetType: 'pdf', assetId: 'a2', fileName: 'doc.pdf' },
        },
      ],
      nextCursor: null,
    });

    expect(bookmarks.map((b) => [b.kind, b.title, b.url, b.imageAssetId])).toEqual([
      ['text', null, 'https://src.test', null],
      ['asset', 'cat.png', null, 'a1'],
      ['asset', 'doc.pdf', null, null],
    ]);
  });

  it('keeps unknown content as kind unknown and drops entries without id', () => {
    const { bookmarks, nextCursor } = parseBookmarkPage({
      bookmarks: [
        { ...base, id: 'u', content: { type: 'unknown' } },
        { ...base, id: 'v', content: { type: 'hologram', url: 'x' } },
        { ...base, id: 'w' },
        { ...base },
        null,
      ],
    });
    expect(bookmarks.map((b) => [b.id, b.kind, b.url])).toEqual([
      ['u', 'unknown', null],
      ['v', 'unknown', null],
      ['w', 'unknown', null],
    ]);
    expect(nextCursor).toBeNull();
  });

  it('does not validate URLs: that is the job of the UI layer', () => {
    const { bookmarks } = parseBookmarkPage({
      bookmarks: [{ ...base, id: 'x', content: { type: 'link', url: 'javascript:alert(1)' } }],
      nextCursor: null,
    });
    expect(bookmarks[0]!.url).toBe('javascript:alert(1)');
  });

  it.each([null, [], {}, { bookmarks: 'many' }])('rejects the body %j', (body) => {
    expect(() => parseBookmarkPage(body)).toThrow(KarakeepError);
  });
});
