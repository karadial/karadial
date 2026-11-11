import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/InlineConfig.html
export default defineConfig({
  // WXT defaults to MV2 for Firefox. KaraDial is MV3 on every browser.
  manifestVersion: 3,
  modules: ['@wxt-dev/module-svelte'],
  // Explicit imports only, no WXT auto-imports.
  imports: false,
  manifest: ({ browser }) => ({
    name: 'KaraDial',
    description: 'Speed dial new tab page for bookmarks from your self-hosted Karakeep instance.',
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
      browser_specific_settings: {
        gecko: {
          id: 'karadial@karadial.github.io',
          // First Firefox release with built-in data collection consent.
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
