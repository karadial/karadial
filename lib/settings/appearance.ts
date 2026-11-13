import { browser } from 'wxt/browser';

export const THEMES = ['system', 'light', 'dark'] as const;
export const TILE_SIZES = ['small', 'medium', 'large'] as const;
/**
 * How a preview image fills its tile: cropped from the top, cropped around
 * the middle, shown whole with bars, or stretched out of proportion.
 */
export const IMAGE_FITS = ['cover-top', 'cover', 'contain', 'stretch'] as const;

export type Theme = (typeof THEMES)[number];
export type TileSize = (typeof TILE_SIZES)[number];
export type ImageFit = (typeof IMAGE_FITS)[number];

/** A tile grid laid out by the user instead of by a tile size. */
export interface TileLayout {
  /** Tiles per row. Narrow windows show fewer. */
  columns: number;
  /** Gap between tiles in CSS pixels. */
  spacing: number;
  /** Width of the whole grid in percent of the window. */
  width: number;
}

/** Range and step of each layout value, also used by the sliders. */
export const TILE_LAYOUT_LIMITS: Record<
  keyof TileLayout,
  { min: number; max: number; step: number }
> = {
  columns: { min: 2, max: 12, step: 1 },
  spacing: { min: 0, max: 40, step: 2 },
  width: { min: 40, max: 100, step: 5 },
};

export const DEFAULT_TILE_LAYOUT: TileLayout = { columns: 6, spacing: 8, width: 100 };

/** How KaraDial looks. Stored in `storage.local` only. */
export interface Appearance {
  /** `system` follows the browser's light or dark preference. */
  theme: Theme;
  /** Used unless `customLayout` is on. */
  tileSize: TileSize;
  /** Lay the tiles out by `layout` instead of `tileSize`. */
  customLayout: boolean;
  /** Kept while `customLayout` is off, so switching back restores it. */
  layout: TileLayout;
  imageFit: ImageFit;
  /** The title below the preview image. */
  showTitle: boolean;
  /** The host name below the title. */
  showAddress: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  tileSize: 'medium',
  customLayout: false,
  layout: DEFAULT_TILE_LAYOUT,
  imageFit: 'cover-top',
  showTitle: true,
  showAddress: true,
};

const STORAGE_KEY = 'appearance';

const asRecord = (value: unknown) =>
  (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;

/** Numbers are rounded and moved into their range. Anything else becomes the default. */
function parseTileLayout(value: unknown): TileLayout {
  const stored = asRecord(value);
  const layout = { ...DEFAULT_TILE_LAYOUT };
  for (const key of Object.keys(layout) as (keyof TileLayout)[]) {
    const number = stored[key];
    if (typeof number !== 'number' || !Number.isFinite(number)) continue;
    const { min, max } = TILE_LAYOUT_LIMITS[key];
    layout[key] = Math.min(max, Math.max(min, Math.round(number)));
  }
  return layout;
}

/** Unknown or missing values fall back to the defaults. */
export function parseAppearance(value: unknown): Appearance {
  const { theme, tileSize, customLayout, layout, imageFit, showTitle, showAddress } =
    asRecord(value);
  return {
    theme: THEMES.find((known) => known === theme) ?? DEFAULT_APPEARANCE.theme,
    tileSize: TILE_SIZES.find((known) => known === tileSize) ?? DEFAULT_APPEARANCE.tileSize,
    customLayout: customLayout === true,
    layout: parseTileLayout(layout),
    imageFit: IMAGE_FITS.find((known) => known === imageFit) ?? DEFAULT_APPEARANCE.imageFit,
    showTitle: showTitle !== false,
    showAddress: showAddress !== false,
  };
}

export async function getAppearance(): Promise<Appearance> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return parseAppearance(stored[STORAGE_KEY]);
}

export async function saveAppearance(appearance: Appearance): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: parseAppearance(appearance) });
}

/** Calls `callback` whenever the appearance changes. Returns an unsubscribe function. */
export function onAppearanceChanged(callback: (appearance: Appearance) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const change = changes[STORAGE_KEY];
    if (area === 'local' && change) callback(parseAppearance(change.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** The part of the root element that `applyAppearance` writes to. */
export interface AppearanceRoot {
  dataset: Record<string, string | undefined>;
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): unknown };
}

/** Sets the attributes and custom properties that `assets/theme.css` reacts to. */
export function applyAppearance(
  appearance: Appearance,
  root: AppearanceRoot = document.documentElement,
): void {
  if (appearance.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = appearance.theme;
  root.dataset.tileSize = appearance.tileSize;

  const { columns, spacing, width } = appearance.layout;
  const properties = {
    '--tile-columns': String(columns),
    '--tile-gap': `${spacing}px`,
    '--dial-width': `${width}%`,
  };
  if (appearance.customLayout) root.dataset.tileLayout = 'custom';
  else delete root.dataset.tileLayout;
  for (const [name, value] of Object.entries(properties)) {
    if (appearance.customLayout) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }

  // Only what differs from the standard is marked, like the theme.
  const marks = {
    tileImage:
      appearance.imageFit === DEFAULT_APPEARANCE.imageFit ? undefined : appearance.imageFit,
    tileTitle: appearance.showTitle ? undefined : 'off',
    tileAddress: appearance.showAddress ? undefined : 'off',
  };
  for (const [name, value] of Object.entries(marks)) {
    if (value === undefined) delete root.dataset[name];
    else root.dataset[name] = value;
  }
}

const HINT_KEY = 'appearance';

/**
 * Applies the stored appearance to this page and follows later changes.
 *
 * `storage.local` answers asynchronously, after the first paint. A copy in the
 * extension's own `localStorage` lets the page start with the right theme at
 * once. The copy holds nothing but the appearance.
 */
export function initAppearance(): void {
  try {
    applyAppearance(parseAppearance(JSON.parse(localStorage.getItem(HINT_KEY) ?? 'null')));
  } catch {
    // No usable copy: the page starts with the defaults.
  }
  const update = (appearance: Appearance) => {
    applyAppearance(appearance);
    try {
      localStorage.setItem(HINT_KEY, JSON.stringify(appearance));
    } catch {
      // Without the copy the theme may switch a moment after the page opens.
    }
  };
  void getAppearance().then(update);
  onAppearanceChanged(update);
}
