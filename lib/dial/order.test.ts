import { describe, expect, it } from 'vitest';

import type { Tile } from './model';
import { sortTiles } from './order';

const tile = (id: string, title: string, createdAt: string): Tile => ({
  id,
  url: `https://example.com/${id}`,
  title,
  host: 'example.com',
  imageAssetId: null,
  tags: [],
  createdAt,
});

const tiles = [
  tile('b', 'beta 10', '2026-03-01T00:00:00.000Z'),
  tile('a', 'Alpha', '2026-01-01T00:00:00.000Z'),
  tile('c', 'beta 9', '2026-02-01T00:00:00.000Z'),
  tile('d', 'Émile', ''),
];

const ids = (sorted: Tile[]) => sorted.map((item) => item.id).join('');

describe('sortTiles', () => {
  it('keeps the order of the server', () => {
    expect(ids(sortTiles(tiles, 'karakeep'))).toBe('bacd');
  });

  it('sorts by the date added', () => {
    expect(ids(sortTiles(tiles, 'newest'))).toBe('bcad');
    expect(ids(sortTiles(tiles, 'oldest'))).toBe('dacb');
  });

  it('sorts by title without regard to case, accents and digit count', () => {
    expect(ids(sortTiles(tiles, 'title'))).toBe('acbd');
  });

  it('follows the manual order and puts unknown tiles last', () => {
    expect(ids(sortTiles(tiles, 'manual', ['d', 'gone', 'b']))).toBe('dbac');
    expect(ids(sortTiles(tiles, 'manual'))).toBe('bacd');
  });

  it('does not change the list it was given', () => {
    sortTiles(tiles, 'title');
    expect(ids(tiles)).toBe('bacd');
  });
});
