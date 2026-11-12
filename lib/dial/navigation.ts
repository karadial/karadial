/** Position of a tile on screen, as `getBoundingClientRect()` reports it. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Direction = 'left' | 'right' | 'up' | 'down' | 'first' | 'last';

/**
 * Index of the tile the focus moves to from `current`, or `null` when there is
 * none in that direction.
 *
 * `boxes` are in reading order. Left and right follow that order across rows
 * and groups. Up and down go to the nearest row and pick the tile closest to
 * the current column, so they also work between groups with different numbers
 * of tiles.
 */
export function neighbour(
  boxes: readonly Box[],
  current: number,
  direction: Direction,
): number | null {
  const from = boxes[current];
  if (!from) return null;

  switch (direction) {
    case 'first':
      return 0;
    case 'last':
      return boxes.length - 1;
    case 'left':
      return current > 0 ? current - 1 : null;
    case 'right':
      return current < boxes.length - 1 ? current + 1 : null;
  }

  const sign = direction === 'down' ? 1 : -1;
  // Tiles of one row share their top edge. Half a tile of tolerance is plenty.
  const tolerance = from.height / 2;
  const centre = from.left + from.width / 2;
  let best: number | null = null;
  let bestRow = Infinity;
  let bestOffset = Infinity;
  boxes.forEach((box, index) => {
    const row = (box.top - from.top) * sign;
    if (row <= tolerance) return;
    const offset = Math.abs(box.left + box.width / 2 - centre);
    const sameRow = Math.abs(row - bestRow) <= tolerance;
    if (row < bestRow - tolerance || (sameRow && offset < bestOffset)) {
      best = index;
      bestRow = sameRow ? bestRow : row;
      bestOffset = offset;
    }
  });
  return best;
}
