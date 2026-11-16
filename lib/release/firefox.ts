/** Add-on ID in `browser_specific_settings.gecko.id`. Bound to the AMO account, never change it. */
export const GECKO_ID = 'karadial@karadial.github.io';

/** Public website of the project, served by GitHub Pages from `site/`. */
export const SITE_URL = 'https://karadial.github.io/karadial/';

/**
 * Where a self-distributed Firefox build looks for updates. Written by
 * `scripts/write-update-manifest.ts` and published with the website.
 */
export const UPDATE_URL = `${SITE_URL}updates.json`;

/** Signed builds are only ever offered from the releases of this repository. */
export const RELEASE_DOWNLOAD_PREFIX = 'https://github.com/karadial/karadial/releases/download/';

/**
 * `browser_specific_settings.gecko` of the Firefox manifest. A build listed on
 * addons.mozilla.org gets its updates from there and must not name an update
 * URL of its own; the self-distributed build updates from the project website.
 */
export function geckoSettings(listed: boolean) {
  return {
    id: GECKO_ID,
    ...(!listed && { update_url: UPDATE_URL }),
    // First Firefox release with built-in data collection consent.
    strict_min_version: '140.0',
    // Sent to the user's own Karakeep instance and nowhere else: the API
    // key with every request, search terms for the server side search.
    data_collection_permissions: { required: ['authenticationInfo', 'searchTerms'] },
  };
}
