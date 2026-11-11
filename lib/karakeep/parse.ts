import { KarakeepError } from './errors';
import type { Bookmark, BookmarkKind, BookmarkPage, KarakeepList } from './types';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const invalid = () => new KarakeepError('invalid-response', 200);

function parseList(value: unknown): KarakeepList | null {
  if (!isObject(value)) return null;
  const id = str(value.id);
  const name = str(value.name);
  if (id === null || name === null) return null;
  return {
    id,
    name,
    icon: str(value.icon) ?? '',
    parentId: str(value.parentId),
    type: value.type === 'smart' ? 'smart' : 'manual',
  };
}

/** Parses the body of `GET /lists`. Entries without id or name are dropped. */
export function parseLists(body: unknown): KarakeepList[] {
  if (!isObject(body) || !Array.isArray(body.lists)) throw invalid();
  return body.lists.map(parseList).filter((list) => list !== null);
}

const KINDS: readonly BookmarkKind[] = ['link', 'text', 'asset'];

function parseBookmark(value: unknown): Bookmark | null {
  if (!isObject(value)) return null;
  const id = str(value.id);
  if (id === null) return null;

  const content = isObject(value.content) ? value.content : {};
  const kind = KINDS.find((k) => k === content.type) ?? 'unknown';

  let title = str(value.title);
  let description: string | null = null;
  let url: string | null = null;
  let imageAssetId: string | null = null;
  let screenshotAssetId: string | null = null;
  let faviconUrl: string | null = null;

  if (kind === 'link') {
    title ??= str(content.title);
    description = str(content.description);
    url = str(content.url);
    imageAssetId = str(content.imageAssetId);
    screenshotAssetId = str(content.screenshotAssetId);
    faviconUrl = str(content.favicon);
  } else if (kind === 'text') {
    url = str(content.sourceUrl);
  } else if (kind === 'asset') {
    title ??= str(content.fileName);
    url = str(content.sourceUrl);
    if (content.assetType === 'image') imageAssetId = str(content.assetId);
  }

  const tags = Array.isArray(value.tags)
    ? value.tags.map((tag) => (isObject(tag) ? str(tag.name) : null)).filter((t) => t !== null)
    : [];

  return {
    id,
    kind,
    createdAt: str(value.createdAt) ?? '',
    title,
    description,
    url,
    imageAssetId,
    screenshotAssetId,
    faviconUrl,
    archived: value.archived === true,
    favourited: value.favourited === true,
    tags,
  };
}

/** Parses a `PaginatedBookmarks` body. Entries without id are dropped. */
export function parseBookmarkPage(body: unknown): BookmarkPage {
  if (!isObject(body) || !Array.isArray(body.bookmarks)) throw invalid();
  return {
    bookmarks: body.bookmarks.map(parseBookmark).filter((bookmark) => bookmark !== null),
    nextCursor: str(body.nextCursor),
  };
}
