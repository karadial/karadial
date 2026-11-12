import { browser } from 'wxt/browser';

export const THEMES = ['system', 'light', 'dark'] as const;
export const TILE_SIZES = ['small', 'medium', 'large'] as const;

export type Theme = (typeof THEMES)[number];
export type TileSize = (typeof TILE_SIZES)[number];

/** How KaraDial looks. Stored in `storage.local` only. */
export interface Appearance {
  /** `system` follows the browser's light or dark preference. */
  theme: Theme;
  tileSize: TileSize;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', tileSize: 'medium' };

const STORAGE_KEY = 'appearance';

/** Unknown or missing values fall back to the defaults. */
export function parseAppearance(value: unknown): Appearance {
  const { theme, tileSize } = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    theme: THEMES.find((known) => known === theme) ?? DEFAULT_APPEARANCE.theme,
    tileSize: TILE_SIZES.find((known) => known === tileSize) ?? DEFAULT_APPEARANCE.tileSize,
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

/** Sets the attributes that `assets/theme.css` reacts to. */
export function applyAppearance(
  appearance: Appearance,
  root: { dataset: Record<string, string | undefined> } = document.documentElement,
): void {
  if (appearance.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = appearance.theme;
  root.dataset.tileSize = appearance.tileSize;
}

const HINT_KEY = 'appearance';

/**
 * Applies the stored appearance to this page and follows later changes.
 *
 * `storage.local` answers asynchronously, after the first paint. A copy in the
 * extension's own `localStorage` lets the page start with the right theme at
 * once. The copy holds nothing but theme and tile size.
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
