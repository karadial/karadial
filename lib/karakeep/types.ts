/**
 * KaraDial's view of the Karakeep API.
 *
 * Derived by hand from the OpenAPI spec (schemas `List`, `Bookmark`,
 * `PaginatedBookmarks`), reduced to the fields KaraDial uses:
 * https://raw.githubusercontent.com/karakeep-app/karakeep/refs/heads/main/packages/open-api/karakeep-openapi-spec.json
 *
 * Everything in here originates from arbitrary websites or user input and is
 * untrusted. Never render it as HTML and check URLs with `isHttpUrl`.
 */

export interface KarakeepList {
  id: string;
  name: string;
  /** Emoji or short text chosen by the user. */
  icon: string;
  /** `null` for a top level list. */
  parentId: string | null;
  /** Smart lists compute their bookmarks from a query on the server. */
  type: 'manual' | 'smart';
}

export type BookmarkKind = 'link' | 'text' | 'asset' | 'unknown';

export interface Bookmark {
  id: string;
  kind: BookmarkKind;
  /** ISO timestamp as sent by the server. */
  createdAt: string;
  /** User title, else the crawled page title, else the file name. */
  title: string | null;
  description: string | null;
  /** Target of the bookmark. Unvalidated, may be any scheme. */
  url: string | null;
  /** Banner image stored by Karakeep (or the image itself for image assets). */
  imageAssetId: string | null;
  /** Page screenshot stored by Karakeep. */
  screenshotAssetId: string | null;
  /** Favicon URL on the bookmarked site. Loading it contacts a third party. */
  faviconUrl: string | null;
  archived: boolean;
  favourited: boolean;
  tags: string[];
}

export interface BookmarkPage {
  bookmarks: Bookmark[];
  /** `null` when there are no more pages. */
  nextCursor: string | null;
}
