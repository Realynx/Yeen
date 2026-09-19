import { setWebStaticCacheHeaders } from './web-static-cache-headers';

describe('setWebStaticCacheHeaders', () => {
  it('forces service worker checks through to the server', () => {
    const setHeader = jest.fn();

    setWebStaticCacheHeaders({ setHeader }, '/srv/yeen/apps/web/dist/sw.js');

    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-cache, no-store, must-revalidate',
    );
    expect(setHeader).toHaveBeenCalledWith('Service-Worker-Allowed', '/');
  });

  it('revalidates the app shell and permanently caches versioned assets', () => {
    const setHeader = jest.fn();

    setWebStaticCacheHeaders({ setHeader }, 'C:\\yeen\\dist\\index.html');
    expect(setHeader).toHaveBeenLastCalledWith(
      'Cache-Control',
      'no-cache, must-revalidate',
    );

    setWebStaticCacheHeaders(
      { setHeader },
      'C:\\yeen\\dist\\assets\\index-AbCd1234.js',
    );
    expect(setHeader).toHaveBeenLastCalledWith(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    );
  });
});
