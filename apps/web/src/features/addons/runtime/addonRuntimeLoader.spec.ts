import { describe, expect, it } from 'vitest';
import { authenticatedAddonEntryUrl } from './addonRuntimeLoader';

describe('authenticated add-on entry URL', () => {
  it('resolves same-origin paths and adds the access token', () => {
    const url = authenticatedAddonEntryUrl(
      '/api/addons/runtime/demo/web.js?version=1',
      'secret token',
      'https://yeen.test/library',
    );

    expect(url).toBe(
      'https://yeen.test/api/addons/runtime/demo/web.js?version=1&access_token=secret+token',
    );
  });

  it('rejects cross-origin entrypoints', () => {
    expect(() => authenticatedAddonEntryUrl(
      'https://evil.test/addon.js',
      'token',
      'https://yeen.test/',
    )).toThrow(/Yeen origin/);
  });

  it('resolves host-provided paths through a separately configured API origin', () => {
    const url = authenticatedAddonEntryUrl(
      '/api/addons/runtime/com.yeen.downloader/digest/assets/web/index.js',
      'secret token',
      'http://localhost:5173/library',
      'http://localhost:4000/api',
    );

    expect(url).toBe(
      'http://localhost:4000/api/addons/runtime/com.yeen.downloader/digest/assets/web/index.js?access_token=secret+token',
    );
  });
});
