import { MetadataCommitParticipantRegistry } from './metadata-commit-participant';

const PLAN = {
  changes: [
    {
      mediaId: 'media-1',
      currentPath: '/old/movie.mkv',
      targetPath: '/new/movie.mkv',
      willMove: true,
      sidecars: [],
    },
  ],
};

describe('MetadataCommitParticipantRegistry', () => {
  it('prepares and completes registered participants', async () => {
    const registry = new MetadataCommitParticipantRegistry();
    const complete = jest.fn().mockResolvedValue(undefined);
    registry.register({
      participantId: 'test',
      prepare: jest.fn().mockResolvedValue({
        complete,
        abort: jest.fn().mockResolvedValue(undefined),
      }),
    });

    const prepared = await registry.prepare(PLAN);
    const warnings = await registry.complete(prepared, {
      commitId: 'commit-1',
      changes: [],
    });

    expect(warnings).toEqual([]);
    expect(complete).toHaveBeenCalledWith({
      commitId: 'commit-1',
      changes: [],
    });
  });

  it('aborts already prepared participants when a later participant fails', async () => {
    const registry = new MetadataCommitParticipantRegistry();
    const abort = jest.fn().mockResolvedValue(undefined);
    registry.register({
      participantId: 'first',
      prepare: jest.fn().mockResolvedValue({
        complete: jest.fn(),
        abort,
      }),
    });
    registry.register({
      participantId: 'second',
      prepare: jest.fn().mockRejectedValue(new Error('preflight failed')),
    });

    await expect(registry.prepare(PLAN)).rejects.toThrow('preflight failed');
    expect(abort).toHaveBeenCalledTimes(1);
  });
});
