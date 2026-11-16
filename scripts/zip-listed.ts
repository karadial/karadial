/**
 * Builds and zips the Firefox build for the listing on addons.mozilla.org.
 *
 *   node scripts/zip-listed.ts
 *
 * It differs from `npm run zip:firefox` in one point: the manifest names no
 * update URL, because a listed add-on is updated by addons.mozilla.org. The
 * switch is an environment variable read by `wxt.config.ts`; setting it here
 * keeps the command the same on every operating system.
 */
import { zip } from 'wxt';

process.env.KARADIAL_LISTED = '1';

await zip({ browser: 'firefox' });
