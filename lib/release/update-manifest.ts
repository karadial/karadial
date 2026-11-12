/**
 * Builds the Firefox update manifest (`updates.json`) from the GitHub
 * releases of this repository.
 * Format: https://extensionworkshop.com/documentation/manage/updating-your-extension/
 */

/** The fields of a GitHub release that matter here. */
export interface Release {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
}

export interface SignedBuild {
  version: string;
  url: string;
}

export interface HashedBuild extends SignedBuild {
  /** Lowercase hex SHA-256 of the `.xpi`. */
  sha256: string;
}

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const SIGNED_SUFFIX = '-firefox-signed.xpi';

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let part = 0; part < 3; part++) {
    const difference = (left[part] ?? 0) - (right[part] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The signed Firefox builds among the releases, oldest version first.
 *
 * Drafts, prereleases, tags that are not `v<major>.<minor>.<patch>`, releases
 * without a signed `.xpi` and downloads outside `downloadPrefix` are left out.
 */
export function signedBuilds(releases: readonly Release[], downloadPrefix: string): SignedBuild[] {
  const builds: SignedBuild[] = [];
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const tag = TAG.exec(release.tag_name);
    if (!tag) continue;
    const asset = release.assets.find(
      (candidate) =>
        candidate.name.endsWith(SIGNED_SUFFIX) &&
        candidate.browser_download_url.startsWith(downloadPrefix),
    );
    if (!asset) continue;
    builds.push({ version: `${tag[1]}.${tag[2]}.${tag[3]}`, url: asset.browser_download_url });
  }
  return builds.sort((a, b) => compareVersions(a.version, b.version));
}

/** The content of `updates.json` for one add-on. */
export function updateManifest(addonId: string, builds: readonly HashedBuild[]) {
  return {
    addons: {
      [addonId]: {
        updates: builds.map((build) => ({
          version: build.version,
          update_link: build.url,
          update_hash: `sha256:${build.sha256}`,
        })),
      },
    },
  };
}
