import { defineConfig } from 'wxt';

import { geckoSettings } from './lib/release/firefox';

/** Set by `npm run zip:firefox:listed`: the build for the listing on addons.mozilla.org. */
const LISTED = process.env.KARADIAL_LISTED === '1';

// See https://wxt.dev/api/reference/wxt/interfaces/InlineConfig.html
export default defineConfig({
  // The listed build gets its own file name, so it is never mistaken for the other one.
  ...(LISTED && { zip: { artifactTemplate: '{{name}}-{{version}}-{{browser}}-listed.zip' } }),
  // WXT defaults to MV2 for Firefox. KaraDial is MV3 on every browser.
  manifestVersion: 3,
  modules: ['@wxt-dev/module-svelte'],
  // Explicit imports only, no WXT auto-imports.
  imports: false,
  manifest: ({ browser }) => ({
    name: 'KaraDial',
    description:
      'Replaces your new tab page with a speed dial for the bookmarks in your self-hosted Karakeep instance.',
    permissions: ['storage'],
    // Nothing is granted at install. The options page requests access to the
    // one configured Karakeep host at runtime, which needs a covering pattern.
    optional_host_permissions: ['*://*/*'],
    // The Firefox MV3 default adds `upgrade-insecure-requests`, which would
    // break plain http Karakeep instances on a LAN. Scripts stay bundled only.
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: { gecko: geckoSettings(LISTED) },
    }),
  }),
});
