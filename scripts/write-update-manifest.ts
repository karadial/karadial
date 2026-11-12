/**
 * Writes the Firefox update manifest from the GitHub releases of this
 * repository. Run by `.github/workflows/pages.yml`:
 *
 *   node scripts/write-update-manifest.ts site/updates.json
 *
 * Needs Node 24 (runs TypeScript directly). `GITHUB_TOKEN` is optional and
 * only raises the API rate limit.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { GECKO_ID, RELEASE_DOWNLOAD_PREFIX } from '../lib/release/firefox.ts';
import {
  signedBuilds,
  updateManifest,
  type HashedBuild,
  type Release,
} from '../lib/release/update-manifest.ts';

const RELEASES_URL = 'https://api.github.com/repos/karadial/karadial/releases?per_page=100';

const target = process.argv[2];
if (!target) throw new Error('Usage: node scripts/write-update-manifest.ts <output file>');

const token = process.env.GITHUB_TOKEN;
const response = await fetch(RELEASES_URL, {
  headers: {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
});
if (!response.ok) throw new Error(`Listing the releases failed: HTTP ${response.status}`);
const releases = (await response.json()) as Release[];

const builds: HashedBuild[] = [];
for (const build of signedBuilds(releases, RELEASE_DOWNLOAD_PREFIX)) {
  // No token here: the download redirects to another host.
  const download = await fetch(build.url);
  if (!download.ok) throw new Error(`Downloading ${build.url} failed: HTTP ${download.status}`);
  const sha256 = createHash('sha256')
    .update(new Uint8Array(await download.arrayBuffer()))
    .digest('hex');
  builds.push({ ...build, sha256 });
}

await writeFile(target, `${JSON.stringify(updateManifest(GECKO_ID, builds), null, 2)}\n`);
console.log(`Wrote ${target} with ${builds.length} version(s).`);
