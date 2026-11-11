import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  clearConnection,
  getConnection,
  maskApiKey,
  onConnectionChanged,
  saveConnection,
} from './connection';

const connection = { baseUrl: 'https://keep.example.com', apiKey: 'ak2_0123456789abcdef' };

describe('connection settings', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('returns null when nothing is stored', async () => {
    expect(await getConnection()).toBeNull();
  });

  it('stores and reads the connection in storage.local', async () => {
    await saveConnection(connection);
    expect(await getConnection()).toEqual(connection);
    expect(await fakeBrowser.storage.local.get('connection')).toEqual({ connection });
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});
  });

  it('clears the connection', async () => {
    await saveConnection(connection);
    await clearConnection();
    expect(await getConnection()).toBeNull();
  });

  it.each([
    ['a string', 'https://keep.example.com'],
    ['a missing key', { baseUrl: 'https://keep.example.com' }],
    ['an empty key', { baseUrl: 'https://keep.example.com', apiKey: '' }],
    ['a non-http URL', { baseUrl: 'javascript:alert(1)', apiKey: 'k' }],
    ['a non-string URL', { baseUrl: 42, apiKey: 'k' }],
  ])('ignores stored data with %s', async (_label, stored) => {
    await fakeBrowser.storage.local.set({ connection: stored });
    expect(await getConnection()).toBeNull();
  });

  it('notifies about changes until unsubscribed', async () => {
    const callback = vi.fn();
    const unsubscribe = onConnectionChanged(callback);

    await saveConnection(connection);
    expect(callback).toHaveBeenLastCalledWith(connection);

    await clearConnection();
    expect(callback).toHaveBeenLastCalledWith(null);

    unsubscribe();
    await saveConnection(connection);
    expect(callback).toHaveBeenCalledTimes(2);
  });
});

describe('maskApiKey', () => {
  it('keeps only the last four characters of a long key', () => {
    const masked = maskApiKey('ak2_0123456789abcdef');
    expect(masked).toBe('••••••••cdef');
    expect(masked).not.toContain('0123');
  });

  it('shows nothing of a short key', () => {
    expect(maskApiKey('short')).toBe('••••••••');
  });
});
