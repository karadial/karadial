import { browser } from 'wxt/browser';

const STORAGE_KEY = 'pages';

function parseStored(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === 'string' && id !== '');
  return [...new Set(ids)];
}

/** Ids of the Karakeep lists shown as pages, in display order. */
export async function getPageListIds(): Promise<string[]> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return parseStored(stored[STORAGE_KEY]);
}

export async function savePageListIds(ids: readonly string[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: parseStored(ids) });
}

export async function clearPageListIds(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
}

/** Calls `callback` whenever the page selection changes. Returns an unsubscribe function. */
export function onPageListIdsChanged(callback: (ids: string[]) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const change = changes[STORAGE_KEY];
    if (area === 'local' && change) callback(parseStored(change.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
