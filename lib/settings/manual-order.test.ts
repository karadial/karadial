import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  clearManualOrders,
  getManualOrders,
  onManualOrdersChanged,
  saveManualOrder,
} from './manual-order';

describe('manual tile order', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('starts empty', async () => {
    expect(await getManualOrders()).toEqual({});
  });

  it('stores the order of one list and keeps the others', async () => {
    await saveManualOrder('work', ['b', 'a']);
    await saveManualOrder('home', ['x']);
    await saveManualOrder('work', ['a', 'b']);
    expect(await getManualOrders()).toEqual({ work: ['a', 'b'], home: ['x'] });
  });

  it('drops what is not a list of ids', async () => {
    await browser.storage.local.set({
      manualOrders: { work: ['a', 7, 'a', 'b'], home: 'x', tools: null },
    });
    expect(await getManualOrders()).toEqual({ work: ['a', 'b'] });
    await browser.storage.local.set({ manualOrders: ['a'] });
    expect(await getManualOrders()).toEqual({});
  });

  it('forgets every order', async () => {
    await saveManualOrder('work', ['a']);
    await clearManualOrders();
    expect(await getManualOrders()).toEqual({});
  });

  it('notifies about changes', async () => {
    const callback = vi.fn();
    const unsubscribe = onManualOrdersChanged(callback);
    await saveManualOrder('work', ['a', 'b']);
    expect(callback).toHaveBeenLastCalledWith({ work: ['a', 'b'] });
    unsubscribe();
  });
});
