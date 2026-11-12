import { describe, expect, it } from 'vitest';

import { signedBuilds, updateManifest, type Release } from './update-manifest';

const PREFIX = 'https://github.com/karadial/karadial/releases/download/';

const release = (tag: string, overrides: Partial<Release> = {}): Release => {
  const version = tag.replace(/^v/, '');
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      { name: `karadial-${version}-firefox.zip`, browser_download_url: `${PREFIX}${tag}/a.zip` },
      {
        name: `karadial-${version}-firefox-signed.xpi`,
        browser_download_url: `${PREFIX}${tag}/karadial-${version}-firefox-signed.xpi`,
      },
    ],
    ...overrides,
  };
};

describe('signedBuilds', () => {
  it('lists the signed builds, oldest version first', () => {
    const builds = signedBuilds([release('v0.10.0'), release('v0.7.0'), release('v0.9.2')], PREFIX);
    expect(builds).toEqual([
      { version: '0.7.0', url: `${PREFIX}v0.7.0/karadial-0.7.0-firefox-signed.xpi` },
      { version: '0.9.2', url: `${PREFIX}v0.9.2/karadial-0.9.2-firefox-signed.xpi` },
      { version: '0.10.0', url: `${PREFIX}v0.10.0/karadial-0.10.0-firefox-signed.xpi` },
    ]);
  });

  it('leaves out drafts and prereleases', () => {
    const releases = [release('v1.0.0', { draft: true }), release('v1.1.0', { prerelease: true })];
    expect(signedBuilds(releases, PREFIX)).toEqual([]);
  });

  it('leaves out tags that are not plain versions', () => {
    expect(signedBuilds([release('v1.0.0-beta.1'), release('nightly')], PREFIX)).toEqual([]);
  });

  it('leaves out releases without a signed build', () => {
    expect(signedBuilds([release('v1.0.0', { assets: [] })], PREFIX)).toEqual([]);
  });

  it('leaves out downloads from another place', () => {
    const foreign = release('v1.0.0', {
      assets: [
        {
          name: 'karadial-1.0.0-firefox-signed.xpi',
          browser_download_url: 'https://evil.example/karadial-1.0.0-firefox-signed.xpi',
        },
      ],
    });
    expect(signedBuilds([foreign], PREFIX)).toEqual([]);
  });
});

describe('updateManifest', () => {
  it('writes one update per build with its hash', () => {
    const manifest = updateManifest('karadial@karadial.github.io', [
      { version: '0.7.1', url: `${PREFIX}v0.7.1/x.xpi`, sha256: 'abc123' },
    ]);
    expect(manifest).toEqual({
      addons: {
        'karadial@karadial.github.io': {
          updates: [
            {
              version: '0.7.1',
              update_link: `${PREFIX}v0.7.1/x.xpi`,
              update_hash: 'sha256:abc123',
            },
          ],
        },
      },
    });
  });

  it('keeps an empty list when nothing is released yet', () => {
    expect(updateManifest('id', [])).toEqual({ addons: { id: { updates: [] } } });
  });
});
