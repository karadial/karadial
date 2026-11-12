import { describe, expect, it } from 'vitest';

import { neighbour, type Box } from './navigation';

const box = (column: number, top: number): Box => ({
  left: column * 110,
  top,
  width: 100,
  height: 80,
});

/**
 * Three columns. A page with five tiles, then a group with two tiles below a
 * heading, so the rows are not evenly spaced:
 *
 *   0 1 2
 *   3 4
 *   (heading)
 *   5 6
 */
const boxes = [box(0, 0), box(1, 0), box(2, 0), box(0, 90), box(1, 90), box(0, 220), box(1, 220)];

describe('neighbour', () => {
  it('moves left and right in reading order, across rows', () => {
    expect(neighbour(boxes, 1, 'left')).toBe(0);
    expect(neighbour(boxes, 2, 'right')).toBe(3);
    expect(neighbour(boxes, 3, 'left')).toBe(2);
    expect(neighbour(boxes, 4, 'right')).toBe(5);
  });

  it('stops at both ends', () => {
    expect(neighbour(boxes, 0, 'left')).toBeNull();
    expect(neighbour(boxes, 6, 'right')).toBeNull();
  });

  it('moves down and up within a column', () => {
    expect(neighbour(boxes, 0, 'down')).toBe(3);
    expect(neighbour(boxes, 1, 'down')).toBe(4);
    expect(neighbour(boxes, 4, 'up')).toBe(1);
  });

  it('crosses the gap between groups to the nearest row', () => {
    expect(neighbour(boxes, 3, 'down')).toBe(5);
    expect(neighbour(boxes, 6, 'up')).toBe(4);
  });

  it('picks the closest tile when the next row is shorter', () => {
    expect(neighbour(boxes, 2, 'down')).toBe(4);
  });

  it('returns null above the first and below the last row', () => {
    expect(neighbour(boxes, 1, 'up')).toBeNull();
    expect(neighbour(boxes, 5, 'down')).toBeNull();
  });

  it('jumps to the first and last tile', () => {
    expect(neighbour(boxes, 4, 'first')).toBe(0);
    expect(neighbour(boxes, 4, 'last')).toBe(6);
  });

  it('returns null for an unknown tile', () => {
    expect(neighbour(boxes, 9, 'down')).toBeNull();
    expect(neighbour([], 0, 'first')).toBeNull();
  });
});
