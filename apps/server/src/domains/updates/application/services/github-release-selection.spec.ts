import {
  compareSemanticVersions,
  isAllowedGithubDownloadRedirect,
  isAllowedGithubReleaseAssetUrl,
  selectLatestGithubRelease,
} from './github-release-selection';

describe('GitHub release selection', () => {
  const assets = (version: string) => [
    {
      name: `yeen-v${version}.zip`,
      browser_download_url: `https://example.test/${version}.zip`,
      size: 100,
    },
    {
      name: `yeen-v${version}.zip.sha256`,
      browser_download_url: `https://example.test/${version}.sha256`,
      size: 100,
    },
    {
      name: `yeen-v${version}.release.json`,
      browser_download_url: `https://example.test/${version}.json`,
      size: 100,
    },
  ];

  it('orders semantic versions numerically', () => {
    expect(compareSemanticVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemanticVersions('2.0.0-beta.1', '2.0.0')).toBeLessThan(0);
    expect(
      compareSemanticVersions('1.2.3-alpha-beta.2', '1.2.3-alpha-beta.1'),
    ).toBeGreaterThan(0);
  });

  it('treats a prerelease semver tag as prerelease even if GitHub flags it incorrectly', () => {
    const selected = selectLatestGithubRelease(
      [
        {
          tag_name: 'v2.0.0-beta.1',
          draft: false,
          prerelease: false,
          published_at: '2026-02-01T00:00:00Z',
          assets: assets('2.0.0-beta.1'),
        },
        {
          tag_name: 'v1.9.0',
          draft: false,
          prerelease: false,
          published_at: '2026-01-01T00:00:00Z',
          assets: assets('1.9.0'),
        },
      ],
      'stable',
    );

    expect(selected?.version).toBe('1.9.0');
  });

  it('selects the newest stable release with the complete artifact trio', () => {
    const selected = selectLatestGithubRelease(
      [
        {
          tag_name: 'v1.1.0',
          draft: false,
          prerelease: false,
          published_at: '2026-01-01T00:00:00Z',
          assets: assets('1.1.0'),
        },
        {
          tag_name: 'v2.0.0-beta.1',
          draft: false,
          prerelease: true,
          published_at: '2026-02-01T00:00:00Z',
          assets: assets('2.0.0-beta.1'),
        },
        {
          tag_name: 'v1.2.0',
          draft: true,
          prerelease: false,
          published_at: '2026-03-01T00:00:00Z',
          assets: assets('1.2.0'),
        },
      ],
      'stable',
    );

    expect(selected?.version).toBe('1.1.0');
  });

  it('never offers a downgrade or same-version reinstall', () => {
    const selected = selectLatestGithubRelease(
      [
        {
          tag_name: 'v1.2.0',
          draft: false,
          prerelease: false,
          published_at: '2026-01-01T00:00:00Z',
          assets: assets('1.2.0'),
        },
      ],
      'stable',
      '1.2.0',
    );

    expect(selected).toBeNull();
  });

  it('rejects release assets and redirects outside GitHub-controlled origins', () => {
    expect(
      isAllowedGithubReleaseAssetUrl(
        'Realynx/Yeen',
        'https://github.com/Realynx/Yeen/releases/download/v1.2.3/yeen-v1.2.3.zip',
      ),
    ).toBe(true);
    expect(
      isAllowedGithubReleaseAssetUrl(
        'Realynx/Yeen',
        'https://github.com/attacker/Yeen/releases/download/v1.2.3/yeen-v1.2.3.zip',
      ),
    ).toBe(false);
    expect(
      isAllowedGithubDownloadRedirect(
        'https://objects.githubusercontent.com/object',
      ),
    ).toBe(true);
    expect(
      isAllowedGithubDownloadRedirect('https://downloads.example.test/object'),
    ).toBe(false);
  });
});
