# KaraDial

KaraDial is a browser extension that replaces the new tab page with a speed dial
for bookmarks stored in your self-hosted [Karakeep](https://karakeep.app) instance.

KaraDial is an independent open-source project. It is not affiliated with
Karakeep or Speed Dial 2.

> **Status:** early development. The features below work in Firefox and Zen.

## Features

- Each Karakeep list you pick becomes one page of tiles. Lists inside it are
  shown as groups. Pages are ordered by drag and drop.
- Typing filters your pages at once. Enter searches all of Karakeep.
- Opens instantly from a local cache and keeps working when the server is
  down.
- The options open in front of the new tab page, so changes show at once.
- Tiles your way: three sizes or your own number of columns, spacing and
  width, vertical centering, how preview images fit, title and address on or
  off.
- Tile order as in Karakeep, by date added, by title, or arranged by hand with
  drag and drop. A manual order is kept in the browser, Karakeep does not
  store one.
- Privacy mode hides your bookmarks, for example while you share your screen.
  Hold Esc for a second on the new tab page to switch it.
- Full keyboard navigation, light and dark theme.

## Targets

- Firefox 140 or later (and Firefox based browsers such as Zen), Manifest V3
- Chrome and Edge, Manifest V3

## What KaraDial changes in your browser

KaraDial replaces the new tab page. This is its only purpose, and it changes
nothing else: not the homepage, not the search engine, no other page.

Firefox asks once whether you want to keep the new tab page when it first
opens. To get the browser's own new tab page back, disable or remove KaraDial
in `about:addons`.

The new tab page is part of the extension. It is never loaded from a server.

## Privacy

KaraDial talks only to the Karakeep instance you configure. It contains no
analytics, no telemetry and no remote code.

What it sends to your Karakeep instance, and nowhere else:

- your API key, with every request
- requests for your lists, their bookmarks and their preview images
- the search terms you enter, when you search all of Karakeep

Firefox therefore lists "authentication information" and "search terms" when
you install KaraDial. Nothing is sent to the developers of KaraDial or to the
bookmarked sites.
Settings, the API key and the cache stay in the browser's local storage.

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

## Releases

Pushing a tag `v<version>` runs `.github/workflows/release.yml`. The tag must
match the version in `package.json`. The workflow

1. runs lint, type check and tests,
2. builds the archives for Firefox and Chrome,
3. has the Firefox build signed by addons.mozilla.org for self-distribution
   (channel "unlisted", not listed in the store),
4. creates a GitHub Release with the archives and the signed `.xpi`.

It needs two repository secrets (Settings, Secrets and variables, Actions).
Both come from the addons.mozilla.org Developer Hub, "Manage API Keys":

| Secret           | Value                                 |
| ---------------- | ------------------------------------- |
| `AMO_JWT_ISSUER` | "JWT issuer", for example `user:1:23` |
| `AMO_JWT_SECRET` | "JWT secret"                          |

addons.mozilla.org signs each version number only once. If a release fails
after signing, the signed `.xpi` is still attached to the workflow run as an
artifact; otherwise raise the version and tag again.

To install a release in Firefox or Zen, open the signed `.xpi` from the
release page in the browser. The signed build updates itself from the project
website.

## License

[MIT](LICENSE)
