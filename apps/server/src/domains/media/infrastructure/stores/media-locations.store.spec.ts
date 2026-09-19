import { parsePersistedMediaLocations } from './media-locations.store';

describe('parsePersistedMediaLocations', () => {
  it('reads legacy string paths as video locations without dropping them', () => {
    expect(parsePersistedMediaLocations(['D:/Movies', 'Z:/TV'])).toEqual([
      { path: 'D:/Movies', type: 'video' },
      { path: 'Z:/TV', type: 'video' },
    ]);
  });

  it('preserves explicit video and music locations', () => {
    expect(
      parsePersistedMediaLocations([
        { path: 'D:/Movies', type: 'video' },
        { path: 'D:/Music', type: 'music' },
      ]),
    ).toEqual([
      { path: 'D:/Movies', type: 'video' },
      { path: 'D:/Music', type: 'music' },
    ]);
  });
});
