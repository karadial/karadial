import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  getAppearance,
  onAppearanceChanged,
  parseAppearance,
  saveAppearance,
} from './appearance';

describe('appearance settings', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('starts with the system theme and medium tiles', async () => {
    expect(await getAppearance()).toEqual({ theme: 'system', tileSize: 'medium' });
  });

  it('stores and returns the appearance', async () => {
    await saveAppearance({ theme: 'dark', tileSize: 'large' });
    expect(await getAppearance()).toEqual({ theme: 'dark', tileSize: 'large' });
  });

  it('replaces unknown values with the defaults', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('dark')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ theme: 'pink', tileSize: 'small' })).toEqual({
      theme: 'system',
      tileSize: 'small',
    });
    expect(parseAppearance({ theme: 'light', tileSize: 7 })).toEqual({
      theme: 'light',
      tileSize: 'medium',
    });
  });

  it('notifies about changes', async () => {
    const callback = vi.fn();
    const unsubscribe = onAppearanceChanged(callback);
    await saveAppearance({ theme: 'light', tileSize: 'small' });
    expect(callback).toHaveBeenLastCalledWith({ theme: 'light', tileSize: 'small' });
    unsubscribe();
  });
});

describe('applyAppearance', () => {
  it('sets theme and tile size on the root element', () => {
    const root = { dataset: {} as Record<string, string | undefined> };
    applyAppearance({ theme: 'dark', tileSize: 'large' }, root);
    expect(root.dataset).toEqual({ theme: 'dark', tileSize: 'large' });
  });

  it('removes the theme attribute for the system theme', () => {
    const root = { dataset: { theme: 'dark' } as Record<string, string | undefined> };
    applyAppearance({ theme: 'system', tileSize: 'small' }, root);
    expect(root.dataset).toEqual({ tileSize: 'small' });
  });
});
