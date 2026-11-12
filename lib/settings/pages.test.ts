import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import { clearPageListIds, getPageListIds, onPageListIdsChanged, savePageListIds } from './pages';

describe('page settings', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('is empty by default', async () => {
    expect(await getPageListIds()).toEqual([]);
  });

  it('keeps the order and drops duplicates', async () => {
    await savePageListIds(['b', 'a', 'b', 'c']);
    expect(await getPageListIds()).toEqual(['b', 'a', 'c']);
  });

  it('ignores stored data that is not a list of ids', async () => {
    await fakeBrowser.storage.local.set({ pages: 'a,b' });
    expect(await getPageListIds()).toEqual([]);
    await fakeBrowser.storage.local.set({ pages: ['a', 7, '', null, 'b'] });
    expect(await getPageListIds()).toEqual(['a', 'b']);
  });

  it('notifies about changes', async () => {
    const callback = vi.fn();
    const unsubscribe = onPageListIdsChanged(callback);
    await savePageListIds(['a']);
    expect(callback).toHaveBeenLastCalledWith(['a']);
    await clearPageListIds();
    expect(callback).toHaveBeenLastCalledWith([]);
    unsubscribe();
  });
});
