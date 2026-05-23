import {
  extractTorrentPathsFromInfoList,
  mapQbTorrentToListItem,
} from './torrent-qbittorrent-mappers';

describe('torrent-qbittorrent-mappers', () => {
  it('returns null when list item payload is not an object or has no hash', () => {
    expect(mapQbTorrentToListItem(null)).toBeNull();
    expect(mapQbTorrentToListItem([])).toBeNull();
    expect(mapQbTorrentToListItem({})).toBeNull();
    expect(mapQbTorrentToListItem({ hash: '   ' })).toBeNull();
  });

  it('maps qb torrent payload to normalized list item values', () => {
    const item = mapQbTorrentToListItem({
      hash: ' abc123 ',
      name: '',
      state: 123,
      progress: 4.2,
      eta: '17',
      dlspeed: '12',
      upspeed: 5.7,
      size: '2048',
      completed: -55,
      save_path: '  /downloads  ',
      seq_dl: 'true',
      f_l_piece_prio: 0,
    });

    expect(item).toEqual({
      hash: 'abc123',
      name: 'abc123',
      state: 'unknown',
      progress: 1,
      etaSeconds: 17,
      downloadRate: 12,
      uploadRate: 6,
      sizeBytes: 2048,
      completedBytes: 0,
      savePath: '  /downloads  ',
      sequentialDownload: true,
      firstLastPiecePriority: false,
    });
  });

  it('extracts and trims torrent paths from first object entry only', () => {
    expect(
      extractTorrentPathsFromInfoList([
        null,
        {
          save_path: '  /qb/save  ',
          content_path: '  /qb/content  ',
        },
      ]),
    ).toEqual({
      savePath: '/qb/save',
      contentPath: '/qb/content',
    });

    expect(
      extractTorrentPathsFromInfoList([
        {
          save_path: '   ',
          content_path: null,
        },
        {
          save_path: '/ignored-second-entry',
          content_path: '/ignored-second-entry',
        },
      ]),
    ).toEqual({
      savePath: null,
      contentPath: null,
    });
  });
});
