import { browser } from 'wxt/browser';

import { parseInstanceUrl } from '@/lib/security/url';

/** How KaraDial reaches the Karakeep instance. Stored in `storage.local` only. */
export interface Connection {
  /** Normalized instance URL without trailing slash, see `parseInstanceUrl`. */
  baseUrl: string;
  apiKey: string;
}

const STORAGE_KEY = 'connection';

function parseStored(value: unknown): Connection | null {
  if (typeof value !== 'object' || value === null) return null;
  const { baseUrl, apiKey } = value as Record<string, unknown>;
  if (typeof baseUrl !== 'string' || typeof apiKey !== 'string' || apiKey === '') return null;
  const parsed = parseInstanceUrl(baseUrl);
  if (!parsed.ok) return null;
  return { baseUrl: parsed.baseUrl, apiKey };
}

export async function getConnection(): Promise<Connection | null> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return parseStored(stored[STORAGE_KEY]);
}

export async function saveConnection(connection: Connection): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: connection });
}

export async function clearConnection(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
}

/** Calls `callback` whenever the stored connection changes. Returns an unsubscribe function. */
export function onConnectionChanged(callback: (connection: Connection | null) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const change = changes[STORAGE_KEY];
    if (area === 'local' && change) callback(parseStored(change.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** Display form of an API key: only the last four characters stay readable. */
export function maskApiKey(apiKey: string): string {
  const visible = apiKey.length >= 12 ? apiKey.slice(-4) : '';
  return '•'.repeat(8) + visible;
}
