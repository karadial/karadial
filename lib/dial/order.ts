import type { TileOrder } from '@/lib/settings/appearance';

import type { Tile } from './model';

const byTitle = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Milliseconds of a tile's date. Tiles without a usable date count as oldest. */
const addedAt = (tile: Tile): number => Date.parse(tile.createdAt) || 0;

/**
 * Returns the tiles of one list in the chosen order. `karakeep` keeps the
 * order the server sent. Tiles that compare equal keep that order too.
 */
export function sortTiles(tiles: readonly Tile[], order: TileOrder): Tile[] {
  switch (order) {
    case 'newest':
      return tiles.toSorted((a, b) => addedAt(b) - addedAt(a));
    case 'oldest':
      return tiles.toSorted((a, b) => addedAt(a) - addedAt(b));
    case 'title':
      return tiles.toSorted((a, b) => byTitle.compare(a.title, b.title));
    default:
      return [...tiles];
  }
}
