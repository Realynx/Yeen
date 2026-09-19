import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RestartCoordinatorService } from '../../../lifecycle/application/services/restart-coordinator.service';
import { CoreUpdateService } from './core-update.service';
import type { UpdateHandoffService } from './update-handoff.service';

describe('CoreUpdateService safety', () => {
  const originalEnv = { ...process.env };
  let stagingRoot: string;
  const requestHandoff = jest.fn(() => ({ state: 'signaling' }));
  const restartCoordinator = {
    getStatus: () => ({ activePlaybackCount: 0 }),
    requestHandoff,
  } as unknown as RestartCoordinatorService;
  const handoff = { launch: jest.fn() } as unknown as UpdateHandoffService;

  beforeEach(async () => {
    requestHandoff.mockClear();
    stagingRoot = await mkdtemp(join(tmpdir(), 'yeen-update-test-'));
    process.env.YEEN_UPDATE_REPOSITORY = 'Realynx/Yeen';
    process.env.YEEN_UPDATE_CHANNEL = 'stable';
    process.env.YEEN_VERSION = '1.0.0';
    process.env.YEEN_DEPLOYMENT_MODE = 'systemd';
    process.env.YEEN_UPDATE_ALLOW_UNSUPPORTED_FOR_TESTS = 'true';
    process.env.YEEN_SUPERVISED_RESTART = 'true';
    process.env.YEEN_UPDATE_STAGING_ROOT = stagingRoot;
    process.env.YEEN_UPDATE_STATUS_ROOT = join(stagingRoot, 'root-status');
    process.env.YEEN_UPDATE_MAX_ARCHIVE_BYTES = String(1024 * 1024);
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
    await rm(stagingRoot, { recursive: true, force: true });
  });

  it('rejects a concurrent apply while the release check is in flight', async () => {
    let finishFetch!: (response: Response) => void;
    jest.spyOn(global, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }),
    );
    const service = new CoreUpdateService(restartCoordinator, handoff);
    const firstApply = service.apply('graceful');

    await expect(service.apply('instant')).rejects.toThrow('already running');
    for (let attempt = 0; attempt < 5 && !finishFetch; attempt += 1) {
      await Promise.resolve();
    }
    expect(finishFetch).toBeDefined();
    finishFetch(
      new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(firstApply).rejects.toThrow('No newer verified release');
  });

  it('reports the explicit operator command instead of attempting a Docker self-update', async () => {
    process.env.YEEN_DEPLOYMENT_MODE = 'docker';
    const service = new CoreUpdateService(restartCoordinator, handoff);

    await expect(service.getStatus()).resolves.toMatchObject({
      managedMode: 'docker',
      operatorCommand: 'docker compose pull && docker compose up -d',
    });
    await expect(service.apply('graceful')).rejects.toThrow(
      'docker compose pull && docker compose up -d',
    );
    expect(requestHandoff).not.toHaveBeenCalled();
  });

  it('stages only an untrusted version intent and never downloads release assets as the service account', async () => {
    const version = '1.1.0';
    const archiveName = `yeen-v${version}.zip`;
    const release = [
      {
        tag_name: `v${version}`,
        draft: false,
        prerelease: false,
        published_at: '2026-01-01T00:00:00Z',
        assets: [
          {
            name: archiveName,
            browser_download_url: `https://github.com/Realynx/Yeen/releases/download/v${version}/${archiveName}`,
            size: 1024,
          },
          {
            name: `${archiveName}.sha256`,
            browser_download_url: `https://github.com/Realynx/Yeen/releases/download/v${version}/${archiveName}.sha256`,
            size: 100,
          },
          {
            name: `yeen-v${version}.release.json`,
            browser_download_url: `https://github.com/Realynx/Yeen/releases/download/v${version}/yeen-v${version}.release.json`,
            size: 100,
          },
        ],
      },
    ];
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(release), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const service = new CoreUpdateService(restartCoordinator, handoff);
    const result = await service.apply('graceful');
    expect(result.phase).toBe('draining');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [jobId] = await readdir(join(stagingRoot, 'staged'));
    expect(
      JSON.parse(
        await readFile(
          join(stagingRoot, 'staged', jobId, 'request.json'),
          'utf8',
        ),
      ),
    ).toEqual({ jobId, version });
    expect(await readdir(join(stagingRoot, 'staged', jobId))).toEqual([
      'request.json',
    ]);
    expect(requestHandoff).toHaveBeenCalledTimes(1);
  });

  it('polls privileged status from the separate read-only status root', async () => {
    const jobId = '123e4567-e89b-42d3-a456-426614174000';
    const rootStatus = join(stagingRoot, 'root-status');
    await mkdir(join(stagingRoot, 'status'), { recursive: true });
    await mkdir(rootStatus, { recursive: true });
    await writeFile(
      join(stagingRoot, 'latest-job.json'),
      JSON.stringify({ jobId, version: '1.1.0' }),
    );
    await writeFile(
      join(stagingRoot, 'status', `${jobId}.json`),
      JSON.stringify({
        schemaVersion: 1,
        jobId,
        version: '1.1.0',
        phase: 'failed',
        message: 'forged service status',
      }),
    );
    await writeFile(
      join(rootStatus, `${jobId}.json`),
      JSON.stringify({
        schemaVersion: 1,
        jobId,
        version: '1.1.0',
        phase: 'succeeded',
        message: 'root-owned status',
      }),
    );

    const service = new CoreUpdateService(restartCoordinator, handoff);
    await expect(service.getStatus()).resolves.toMatchObject({
      phase: 'succeeded',
      message: 'root-owned status',
    });
  });
});
