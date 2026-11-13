import { browser } from 'wxt/browser';

/**
 * The order the user gave the tiles of each list by dragging them: bookmark
 * ids per Karakeep list id. Karakeep has no manual order inside a list, so
 * this lives in `storage.local` of this browser only.
 */
export type ManualOrders = Readonly<Record<string, readonly string[]>>;

const STORAGE_KEY = 'manualOrders';

function parseStored(value: unknown): ManualOrders {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const orders: Record<string, string[]> = {};
  for (const [listId, ids] of Object.entries(value)) {
    if (!Array.isArray(ids)) continue;
    orders[listId] = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
  }
  return orders;
}

export async function getManualOrders(): Promise<ManualOrders> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return parseStored(stored[STORAGE_KEY]);
}

/** Stores the order of one list and keeps the orders of all others. */
export async function saveManualOrder(listId: string, ids: readonly string[]): Promise<void> {
  const orders = await getManualOrders();
  await browser.storage.local.set({ [STORAGE_KEY]: parseStored({ ...orders, [listId]: ids }) });
}

export async function clearManualOrders(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
}

/** Calls `callback` whenever a manual order changes. Returns an unsubscribe function. */
export function onManualOrdersChanged(callback: (orders: ManualOrders) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const change = changes[STORAGE_KEY];
    if (area === 'local' && change) callback(parseStored(change.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
