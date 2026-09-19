import { RemoteMusicSourceRegistry } from './remote-music-source';

describe('RemoteMusicSourceRegistry', () => {
  it('registers and unregisters adapters by stable adapter id', () => {
    const registry = new RemoteMusicSourceRegistry();
    const adapter = {
      adapterId: 'downloader.youtube',
      provider: 'youtube',
      search: jest.fn().mockResolvedValue([]),
    };

    const unregister = registry.register(adapter);
    expect(registry.list()).toEqual([adapter]);

    expect(() => registry.register(adapter)).toThrow(/already registered/i);
    unregister();
    expect(registry.list()).toEqual([]);
  });
});
