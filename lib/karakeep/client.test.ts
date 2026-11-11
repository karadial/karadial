import { describe, expect, it, vi } from 'vitest';

import { createKarakeepClient } from './client';
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
    const fetchMock = vi.fn<typeof fetch>(async () => json({ lists: [{ id: '1' }, { id: '2' }] }));

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
    [502, 'http'],
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
