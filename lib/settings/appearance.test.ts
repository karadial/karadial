import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  DEFAULT_TILE_LAYOUT,
  getAppearance,
  onAppearanceChanged,
  parseAppearance,
  saveAppearance,
  type Appearance,
  type AppearanceRoot,
} from './appearance';

const CUSTOM: Appearance = {
  theme: 'dark',
  tileSize: 'large',
  customLayout: true,
  layout: { columns: 4, spacing: 16, width: 80 },
  imageFit: 'contain',
  showTitle: true,
  showAddress: false,
  tileOrder: 'title',
  centerVertically: true,
  showListIcons: false,
  privacyMode: true,
};

/** Stands in for the root element. */
function fakeRoot(dataset: Record<string, string | undefined> = {}) {
  const properties = new Map<string, string>();
  const root: AppearanceRoot = {
    dataset,
    style: {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name),
    },
  };
  return { root, properties };
}

describe('appearance settings', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('starts with the system theme and medium tiles', async () => {
    expect(await getAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(DEFAULT_APPEARANCE).toMatchObject({
      theme: 'system',
      tileSize: 'medium',
      customLayout: false,
      imageFit: 'cover-top',
      showTitle: true,
      showAddress: true,
      tileOrder: 'karakeep',
      centerVertically: false,
      showListIcons: true,
      privacyMode: false,
    });
  });

  it('stores and returns the appearance', async () => {
    await saveAppearance(CUSTOM);
    expect(await getAppearance()).toEqual(CUSTOM);
  });

  it('replaces unknown values with the defaults', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('dark')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ theme: 'pink', tileSize: 'small' })).toEqual({
      ...DEFAULT_APPEARANCE,
      tileSize: 'small',
    });
    expect(
      parseAppearance({
        theme: 'light',
        tileSize: 7,
        customLayout: 'yes',
        imageFit: 'tiled',
        tileOrder: 'random',
        privacyMode: 1,
      }),
    ).toEqual({ ...DEFAULT_APPEARANCE, theme: 'light' });
  });

  it('reads settings saved before the custom layout existed', () => {
    expect(parseAppearance({ theme: 'dark', tileSize: 'large' })).toEqual({
      ...DEFAULT_APPEARANCE,
      theme: 'dark',
      tileSize: 'large',
    });
  });

  it('keeps layout values inside their range', () => {
    const { layout } = parseAppearance({
      layout: { columns: 99, spacing: -5, width: 72.4 },
    });
    expect(layout).toEqual({ columns: 12, spacing: 0, width: 72 });
    expect(parseAppearance({ layout: { columns: '4', spacing: NaN } }).layout).toEqual(
      DEFAULT_TILE_LAYOUT,
    );
  });

  it('notifies about changes', async () => {
    const callback = vi.fn();
    const unsubscribe = onAppearanceChanged(callback);
    await saveAppearance(CUSTOM);
    expect(callback).toHaveBeenLastCalledWith(CUSTOM);
    unsubscribe();
  });
});

describe('applyAppearance', () => {
  it('sets theme and tile size on the root element', () => {
    const { root, properties } = fakeRoot();
    applyAppearance({ ...DEFAULT_APPEARANCE, theme: 'dark', tileSize: 'large' }, root);
    expect(root.dataset).toEqual({ theme: 'dark', tileSize: 'large' });
    expect(properties.size).toBe(0);
  });

  it('removes the theme attribute for the system theme', () => {
    const { root } = fakeRoot({ theme: 'dark' });
    applyAppearance({ ...DEFAULT_APPEARANCE, tileSize: 'small' }, root);
    expect(root.dataset).toEqual({ tileSize: 'small' });
  });

  it('hands a custom layout to the stylesheet', () => {
    const { root, properties } = fakeRoot();
    applyAppearance(CUSTOM, root);
    expect(root.dataset.tileLayout).toBe('custom');
    expect(Object.fromEntries(properties)).toEqual({
      '--tile-columns': '4',
      '--tile-gap': '16px',
      '--dial-width': '80%',
    });
  });

  it('marks the image fit and hidden texts', () => {
    const { root } = fakeRoot();
    applyAppearance({ ...DEFAULT_APPEARANCE, imageFit: 'stretch', showTitle: false }, root);
    expect(root.dataset).toEqual({ tileSize: 'medium', tileImage: 'stretch', tileTitle: 'off' });
    applyAppearance(DEFAULT_APPEARANCE, root);
    expect(root.dataset).toEqual({ tileSize: 'medium' });
  });

  it('removes the custom layout again', () => {
    const { root, properties } = fakeRoot();
    applyAppearance(CUSTOM, root);
    applyAppearance({ ...CUSTOM, customLayout: false }, root);
    expect(root.dataset.tileLayout).toBeUndefined();
    expect(properties.size).toBe(0);
  });
});
