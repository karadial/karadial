import { describe, expect, it } from 'vitest';

import { buildListTree, flattenListTree, type ListNode } from './lists';
import type { KarakeepList } from './types';

const list = (id: string, parentId: string | null = null): KarakeepList => ({
  id,
  name: id.toUpperCase(),
  icon: '',
  parentId,
  type: 'manual',
});

const shape = (nodes: ListNode[]): unknown =>
  nodes.map((node) => (node.children.length ? [node.list.id, shape(node.children)] : node.list.id));

describe('buildListTree', () => {
  it('nests lists below their parent and keeps API order', () => {
    const tree = buildListTree([
      list('work'),
      list('b', 'work'),
      list('home'),
      list('a', 'work'),
      list('deep', 'a'),
    ]);
    expect(shape(tree)).toEqual([['work', ['b', ['a', ['deep']]]], 'home']);
  });

  it('makes a list with an unknown parent a root', () => {
    expect(shape(buildListTree([list('orphan', 'missing'), list('x')]))).toEqual(['orphan', 'x']);
  });

  it('drops lists in a parent cycle but keeps the rest', () => {
    const tree = buildListTree([list('a', 'b'), list('b', 'a'), list('self', 'self'), list('ok')]);
    expect(shape(tree)).toEqual(['ok']);
  });

  it('ignores a repeated id', () => {
    expect(shape(buildListTree([list('a'), list('a')]))).toEqual(['a']);
  });

  it('returns an empty tree for no lists', () => {
    expect(buildListTree([])).toEqual([]);
  });
});

describe('flattenListTree', () => {
  it('lists every node depth first with its depth', () => {
    const tree = buildListTree([
      list('work'),
      list('home'),
      list('tools', 'work'),
      list('editors', 'tools'),
    ]);
    expect(flattenListTree(tree).map((entry) => [entry.list.id, entry.depth])).toEqual([
      ['work', 0],
      ['tools', 1],
      ['editors', 2],
      ['home', 0],
    ]);
  });
});
