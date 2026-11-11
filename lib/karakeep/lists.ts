import type { KarakeepList } from './types';

export interface ListNode {
  list: KarakeepList;
  children: ListNode[];
}

/**
 * Turns the flat list from the API into a tree using `parentId`.
 *
 * Lists whose parent is missing (for example not shared with this user) become
 * roots. Lists caught in a parent cycle are dropped. Siblings keep API order.
 */
export function buildListTree(lists: readonly KarakeepList[]): ListNode[] {
  const nodes = new Map<string, ListNode>();
  for (const list of lists) {
    if (!nodes.has(list.id)) nodes.set(list.id, { list, children: [] });
  }

  const inCycle = (start: ListNode): boolean => {
    const seen = new Set<string>([start.list.id]);
    let parentId = start.list.parentId;
    while (parentId !== null) {
      if (seen.has(parentId)) return true;
      seen.add(parentId);
      parentId = nodes.get(parentId)?.list.parentId ?? null;
    }
    return false;
  };

  const roots: ListNode[] = [];
  for (const node of nodes.values()) {
    if (inCycle(node)) continue;
    const parent = node.list.parentId === null ? undefined : nodes.get(node.list.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
