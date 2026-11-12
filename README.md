# KaraDial

KaraDial is a browser extension that replaces the new tab page with a speed dial
for bookmarks stored in your self-hosted [Karakeep](https://karakeep.app) instance.

KaraDial is an independent open-source project. It is not affiliated with
Karakeep or Speed Dial 2.

> **Status:** early development. The options page and the new tab page work:
> pages from your Karakeep lists, tiles with preview images, offline cache,
> search on your pages and across all of Karakeep, keyboard navigation, light
> and dark theme.

## Targets

- Firefox 140 or later (and Firefox based browsers such as Zen), Manifest V3
- Chrome and Edge, Manifest V3

## Privacy

KaraDial talks only to the Karakeep instance you configure. It contains no
analytics, no telemetry and no remote code.

## Building from source

Requirements:

- Node.js 24
- npm 11

The build runs on Linux, macOS and Windows. It needs no other tools.

```sh
npm ci
npm run build:firefox   # output: .output/firefox-mv3/
npm run build           # output: .output/chrome-mv3/
```

To create the distributable archives:

```sh
npm run zip:firefox     # .output/karadial-<version>-firefox.zip
                        # .output/karadial-<version>-sources.zip
npm run zip             # .output/karadial-<version>-chrome.zip
```

The sources archive contains everything needed to reproduce the Firefox build
with the commands above. The bundler is [WXT](https://wxt.dev) (Vite), the UI
is written in [Svelte](https://svelte.dev) and TypeScript. All dependency
versions are pinned in `package-lock.json`.

## Loading a development build

Firefox or Zen:

1. Run `npm run build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose "Load Temporary Add-on" and select `.output/firefox-mv3/manifest.json`.

Chrome or Edge:

1. Run `npm run build`.
2. Open `chrome://extensions` and enable developer mode.
3. Choose "Load unpacked" and select `.output/chrome-mv3/`.

## Development

| Command               | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `npm run dev`         | Watch build for Chrome (`.output/chrome-mv3-dev`)   |
| `npm run dev:firefox` | Watch build for Firefox (`.output/firefox-mv3-dev`) |
| `npm run lint`        | ESLint and Prettier check                           |
| `npm run format`      | Format all files with Prettier                      |
| `npm run typecheck`   | Type check TypeScript and Svelte files              |
| `npm test`            | Unit tests (Vitest)                                 |

The dev commands do not open a browser. Load the dev output directory manually
as described above.

## License

[MIT](LICENSE)
