import { describe, expect, it, vi } from 'vitest';

import { createKarakeepClient, MAX_PAGES } from './client';
import { KarakeepError } from './errors';

const baseUrl = 'https://keep.example.com';
const apiKey = 'ak2_secret';

function clientWith(fetchMock: typeof fetch, url = baseUrl) {
  return createKarakeepClient({ baseUrl: url, apiKey, fetch: fetchMock, timeoutMs: 50 });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function failure(promise: Promise<unknown>): Promise<KarakeepError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(KarakeepError);
  return error as KarakeepError;
}

describe('testConnection', () => {
  it('requests the lists endpoint of the instance with the bearer token', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({
        lists: [
          { id: '1', name: 'One' },
          { id: '2', name: 'Two' },
        ],
      }),
    );

    expect(await clientWith(fetchMock).testConnection()).toEqual({ listCount: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://keep.example.com/api/v1/lists');
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Authorization: 'Bearer ak2_secret' },
    });
  });

  it('keeps a sub path of the instance', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ lists: [] }));
    await clientWith(fetchMock, 'http://192.168.1.10:3000/karakeep').testConnection();
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'http://192.168.1.10:3000/karakeep/api/v1/lists',
    );
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [500, 'http'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [504, 'unavailable'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('nope', { status }));
    const error = await failure(clientWith(fetchMock).testConnection());
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
  });

  it('never follows a redirect', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 302, headers: { Location: 'https://evil.test/' } }),
    );
    const error = await failure(clientWith(fetchMock).testConnection());
    expect(error.kind).toBe('redirect');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an opaque redirect response as redirect', async () => {
    const response = { type: 'opaqueredirect', status: 0, ok: false } as Response;
    const error = await failure(clientWith(vi.fn(async () => response)).testConnection());
    expect(error.kind).toBe('redirect');
  });

  it('reports a failed request as network error', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('NetworkError when attempting to fetch resource.');
    });
    expect((await failure(clientWith(fetchMock).testConnection())).kind).toBe('network');
  });

  it('reports a timeout', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
        }),
    );
    expect((await failure(clientWith(fetchMock).testConnection())).kind).toBe('timeout');
  });

  it.each([
    ['HTML instead of JSON', new Response('<html></html>', { status: 200 })],
    ['JSON without lists', json({ ok: true })],
    ['JSON null', json(null)],
    ['lists that are not an array', json({ lists: 'many' })],
  ])('rejects %s as invalid response', async (_label, response) => {
    const error = await failure(clientWith(vi.fn(async () => response)).testConnection());
    expect(error.kind).toBe('invalid-response');
  });

  it('never puts the API key into an error', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('nope', { status: 401 }));
    const error = await failure(clientWith(fetchMock).testConnection());
    expect(error.message).not.toContain(apiKey);
    expect(JSON.stringify(error)).not.toContain(apiKey);
  });
});

const link = (id: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  content: { type: 'link', url: `https://example.com/${id}` },
});

describe('listBookmarksPage', () => {
  it('requests one page of a list without content', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ bookmarks: [link('a')], nextCursor: 'c2' }),
    );

    const page = await clientWith(fetchMock).listBookmarksPage('list/1', { cursor: 'c1' });

    expect(page.nextCursor).toBe('c2');
    expect(page.bookmarks.map((b) => b.id)).toEqual(['a']);
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe(
      'https://keep.example.com/api/v1/lists/list%2F1/bookmarks',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '50',
      cursor: 'c1',
      includeContent: 'false',
    });
  });

  it('cannot be steered to another origin by a list id', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ bookmarks: [], nextCursor: null }));
    await clientWith(fetchMock).listBookmarksPage('../../../../evil.test/x');
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin).toBe('https://keep.example.com');
    expect(url.pathname.startsWith('/api/v1/lists/')).toBe(true);
  });

  it('reports a missing list as not-found', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ code: 'NOT_FOUND', message: 'List not found' }, 404),
    );
    const error = await failure(clientWith(fetchMock).listBookmarksPage('gone'));
    expect(error.kind).toBe('not-found');
  });
});

describe('listAllBookmarks', () => {
  it('follows the cursor to the end', async () => {
    const pages: Record<string, unknown> = {
      '': { bookmarks: [link('a'), link('b')], nextCursor: 'c1' },
      c1: { bookmarks: [link('c')], nextCursor: 'c2' },
      c2: { bookmarks: [link('d')], nextCursor: null },
    };
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      json(pages[new URL(String(url)).searchParams.get('cursor') ?? '']),
    );

    const bookmarks = await clientWith(fetchMock).listAllBookmarks('l1');

    expect(bookmarks.map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops when the server repeats a cursor', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ bookmarks: [link('a')], nextCursor: 'same' }),
    );
    const bookmarks = await clientWith(fetchMock).listAllBookmarks('l1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bookmarks).toHaveLength(2);
  });

  it('stops after the page limit', async () => {
    let n = 0;
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ bookmarks: [], nextCursor: `c${n++}` }),
    );
    await clientWith(fetchMock).listAllBookmarks('l1');
    expect(fetchMock).toHaveBeenCalledTimes(MAX_PAGES);
  });
});

describe('searchBookmarks', () => {
  it('sends the query to the search endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ bookmarks: [link('a')], nextCursor: null }),
    );

    const page = await clientWith(fetchMock).searchBookmarks('is:fav #tag & more', { limit: 20 });

    expect(page.bookmarks).toHaveLength(1);
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/v1/bookmarks/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'is:fav #tag & more',
      limit: '20',
      includeContent: 'false',
    });
  });

  it('rethrows the caller abort reason instead of a network error', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
        }),
    );
    const promise = clientWith(fetchMock).searchBookmarks('x', { signal: controller.signal });
    controller.abort(new Error('superseded'));
    await expect(promise).rejects.toThrow('superseded');
  });
});

describe('getAsset', () => {
  it('downloads the asset with the bearer token and returns a blob', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('png-bytes', { headers: { 'Content-Type': 'image/png' } }),
    );

    const blob = await clientWith(fetchMock).getAsset('asset 1');

    expect(blob.type).toBe('image/png');
    expect(await blob.text()).toBe('png-bytes');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://keep.example.com/api/v1/assets/asset%201');
    expect(init).toMatchObject({
      redirect: 'manual',
      headers: { Authorization: 'Bearer ak2_secret' },
    });
  });

  it('never follows an asset redirect', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(null, { status: 307, headers: { Location: 'https://cdn.test/a.png' } }),
    );
    const error = await failure(clientWith(fetchMock).getAsset('a'));
    expect(error.kind).toBe('redirect');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
