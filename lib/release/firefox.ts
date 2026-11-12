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
