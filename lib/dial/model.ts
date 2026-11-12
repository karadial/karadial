import { buildListTree, type ListNode } from '@/lib/karakeep/lists';
import type { Bookmark, KarakeepList } from '@/lib/karakeep/types';
import { isHttpUrl } from '@/lib/security/url';

/** A bookmark that may be shown as a clickable tile: its URL is http or https. */
export interface Tile {
  id: string;
  url: string;
  title: string;
  /** Host name shown under the title and used for the placeholder letter. */
  host: string;
  /** Karakeep asset to show as preview, banner image first, then screenshot. */
  imageAssetId: string | null;
  /** Only used by the search. */
  tags: string[];
}

export interface DialGroup {
  listId: string;
  /** Path below the page list, for example "Tools / Editors". */
  name: string;
  icon: string;
  tiles: Tile[];
}

export interface DialPage {
  listId: string;
  name: string;
  icon: string;
  /** Bookmarks of the page list itself. */
  tiles: Tile[];
  /** One group per descendant list, depth first. */
  groups: DialGroup[];
}

export type BookmarksByList = ReadonlyMap<string, readonly Bookmark[]>;

function findNode(nodes: readonly ListNode[], id: string): ListNode | null {
  for (const node of nodes) {
    if (node.list.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/** Ids of every list whose bookmarks the given pages need: each page list and its descendants. */
export function listIdsForPages(
  lists: readonly KarakeepList[],
  pageListIds: readonly string[],
): string[] {
  const tree = buildListTree(lists);
  const ids = new Set<string>();
  const collect = (node: ListNode) => {
    ids.add(node.list.id);
    node.children.forEach(collect);
  };
  for (const pageId of pageListIds) {
    const node = findNode(tree, pageId);
    if (node) collect(node);
  }
  return [...ids];
}

/** Turns a bookmark into a tile, or `null` when it has no http(s) target. */
export function toTile(bookmark: Bookmark): Tile | null {
  if (!isHttpUrl(bookmark.url)) return null;
  const host = new URL(bookmark.url).hostname.replace(/^www\./, '');
  return {
    id: bookmark.id,
    url: bookmark.url,
    title: bookmark.title?.trim() || host,
    host,
    imageAssetId: bookmark.imageAssetId ?? bookmark.screenshotAssetId,
    tags: bookmark.tags,
  };
}

/**
 * Adds the tiles of more bookmarks to a result list, for example the next
 * page of a search. Bookmarks without a tile or already listed are skipped.
 */
export function appendTiles(tiles: readonly Tile[], bookmarks: readonly Bookmark[]): Tile[] {
  const seen = new Set(tiles.map((tile) => tile.id));
  const result = [...tiles];
  for (const bookmark of bookmarks) {
    const tile = toTile(bookmark);
    if (!tile || seen.has(tile.id)) continue;
    seen.add(tile.id);
    result.push(tile);
  }
  return result;
}

const tilesOf = (bookmarks: BookmarksByList, listId: string): Tile[] =>
  (bookmarks.get(listId) ?? []).map(toTile).filter((tile) => tile !== null);

/**
 * Builds the pages of the speed dial in the order of `pageListIds`.
 *
 * A selected list that no longer exists is skipped. Groups without tiles are
 * left out, a page without any tile is kept so the user sees it is empty.
 */
export function buildPages(
  lists: readonly KarakeepList[],
  pageListIds: readonly string[],
  bookmarks: BookmarksByList,
): DialPage[] {
  const tree = buildListTree(lists);
  const pages: DialPage[] = [];

  for (const pageId of pageListIds) {
    const node = findNode(tree, pageId);
    if (!node) continue;

    const groups: DialGroup[] = [];
    const walk = (children: readonly ListNode[], prefix: string) => {
      for (const child of children) {
        const name = prefix + child.list.name;
        const tiles = tilesOf(bookmarks, child.list.id);
        if (tiles.length > 0) {
          groups.push({ listId: child.list.id, name, icon: child.list.icon, tiles });
        }
        walk(child.children, `${name} / `);
      }
    };
    walk(node.children, '');

    pages.push({
      listId: node.list.id,
      name: node.list.name,
      icon: node.list.icon,
      tiles: tilesOf(bookmarks, node.list.id),
      groups,
    });
  }
  return pages;
}

/**
 * Every tile of the given pages once, in page order. A bookmark that sits in
 * several lists appears where it comes first.
 */
export function uniqueTiles(pages: readonly DialPage[]): Tile[] {
  const tiles = new Map<string, Tile>();
  for (const page of pages) {
    for (const tile of [...page.tiles, ...page.groups.flatMap((group) => group.tiles)]) {
      if (!tiles.has(tile.id)) tiles.set(tile.id, tile);
    }
  }
  return [...tiles.values()];
}

/** Every Karakeep image the pages show, for cache pruning. */
export function imageAssetIds(pages: readonly DialPage[]): string[] {
  const ids = new Set<string>();
  for (const tile of uniqueTiles(pages)) {
    if (tile.imageAssetId !== null) ids.add(tile.imageAssetId);
  }
  return [...ids];
}
