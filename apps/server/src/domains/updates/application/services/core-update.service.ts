import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  RestartCoordinatorService,
  type RestartMode,
} from '../../../lifecycle/application/services/restart-coordinator.service';
import {
  compareSemanticVersions,
  isAllowedGithubReleaseAssetUrl,
  normalizeSemanticVersion,
  selectLatestGithubRelease,
  type GithubReleasePayload,
  type SelectedGithubRelease,
  type UpdateChannel,
} from './github-release-selection';
import { UpdateHandoffService } from './update-handoff.service';

type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'staged'
  | 'draining'
  | 'applying'
  | 'succeeded'
  | 'failed';

export interface CoreUpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  repository: string | null;
  channel: UpdateChannel;
  configured: boolean;
  managedMode: 'systemd' | 'docker' | 'unsupported';
  operatorCommand: string | null;
  updateAvailable: boolean;
  phase: UpdatePhase;
  mode: RestartMode | null;
  activePlaybackCount: number;
  checkedAt: string | null;
  publishedAt: string | null;
  message: string | null;
}

interface UpdateJobStatus {
  schemaVersion: 1;
  jobId: string;
  version: string;
  phase: 'staged' | 'applying' | 'succeeded' | 'failed';
  message: string | null;
  updatedAt: string;
}

const REPOSITORY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
@Injectable()
export class CoreUpdateService {
  private readonly logger = new Logger(CoreUpdateService.name);
  private latestRelease: SelectedGithubRelease | null = null;
  private operation: Promise<CoreUpdateStatus> | null = null;
  private status: CoreUpdateStatus = {
    currentVersion: '0.0.0',
    latestVersion: null,
    repository: null,
    channel: 'stable',
    configured: false,
    managedMode: 'unsupported',
    operatorCommand: null,
    updateAvailable: false,
    phase: 'idle',
    mode: null,
    activePlaybackCount: 0,
    checkedAt: null,
    publishedAt: null,
    message: null,
  };

  constructor(
    private readonly restartCoordinator: RestartCoordinatorService,
    private readonly handoff: UpdateHandoffService,
  ) {}

  async getStatus(): Promise<CoreUpdateStatus> {
    await this.initializeConfiguration();
    await this.mergeExternalJobStatus();
    return this.withRuntimeStatus();
  }

  async check(): Promise<CoreUpdateStatus> {
    if (this.operation) return this.operation;
    this.operation = this.performCheck().finally(() => {
      this.operation = null;
    });
    return this.operation;
  }

  async apply(mode: RestartMode): Promise<CoreUpdateStatus> {
    if (this.operation)
      throw new ConflictException(
        'Another update operation is already running.',
      );
    this.operation = this.performApply(mode).finally(() => {
      this.operation = null;
    });
    return this.operation;
  }

  private async performCheck(): Promise<CoreUpdateStatus> {
    await this.initializeConfiguration();
    if (!this.status.configured || !this.status.repository) {
      throw new ServiceUnavailableException(
        'Set YEEN_UPDATE_REPOSITORY to owner/repository before checking for updates.',
      );
    }

    this.patchStatus({
      phase: 'checking',
      message: 'Checking GitHub Releases…',
    });
    try {
      const response = await fetch(
        `https://api.github.com/repos/${this.status.repository}/releases?per_page=30`,
        { headers: this.githubHeaders() },
      );
      if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
      const payload = (await response.json()) as GithubReleasePayload[];
      if (!Array.isArray(payload))
        throw new Error('GitHub returned an invalid release list.');

      this.latestRelease = selectLatestGithubRelease(
        payload,
        this.status.channel,
        this.status.currentVersion,
      );
      const checkedAt = new Date().toISOString();
      if (!this.latestRelease) {
        this.patchStatus({
          latestVersion: this.status.currentVersion,
          updateAvailable: false,
          phase: 'up-to-date',
          checkedAt,
          publishedAt: null,
          message: 'Yeen is up to date.',
        });
      } else {
        this.assertReleaseAssetOrigins(this.latestRelease);
        this.patchStatus({
          latestVersion: this.latestRelease.version,
          updateAvailable: true,
          phase: 'available',
          checkedAt,
          publishedAt: this.latestRelease.publishedAt,
          message: `Yeen ${this.latestRelease.version} is available.`,
        });
      }
      return this.withRuntimeStatus();
    } catch (error) {
      this.fail(error, 'Unable to check GitHub Releases.');
      return this.withRuntimeStatus();
    }
  }

  private async performApply(mode: RestartMode): Promise<CoreUpdateStatus> {
    await this.initializeConfiguration();
    if (this.status.managedMode !== 'systemd') {
      throw new ServiceUnavailableException(
        this.status.operatorCommand
          ? `In-app updates are disabled for this deployment. Run: ${this.status.operatorCommand}`
          : 'In-app updates require the supported Linux systemd deployment.',
      );
    }
    if (!this.latestRelease) await this.performCheck();
    const release = this.latestRelease;
    if (
      !release ||
      compareSemanticVersions(release.version, this.status.currentVersion) <= 0
    ) {
      throw new ConflictException('No newer verified release is available.');
    }

    try {
      const job = await this.stageUpdateIntent(release);
      this.patchStatus({
        phase: 'staged',
        mode,
        message:
          'Update requested. The privileged deployment service will independently download and verify the GitHub release.',
      });
      await this.writeLatestJob(job);

      this.restartCoordinator.requestHandoff(mode, async () => {
        try {
          this.patchStatus({
            phase: 'applying',
            message: 'Handing the verified release to the deployment service.',
          });
          await this.handoff.launch(job.jobId);
        } catch (error) {
          this.fail(
            error,
            'The deployment service rejected the update handoff.',
          );
          throw error;
        }
      });
      this.patchStatus({
        phase: mode === 'graceful' ? 'draining' : 'applying',
        message:
          mode === 'graceful'
            ? 'Waiting for active Playback to finish before applying the update.'
            : 'Applying the update now. Active Playback will stop.',
      });
      return this.withRuntimeStatus();
    } catch (error) {
      this.fail(error, 'Unable to stage the selected update.');
      return this.withRuntimeStatus();
    }
  }

  private async stageUpdateIntent(
    release: SelectedGithubRelease,
  ): Promise<UpdateJobStatus> {
    const jobId = randomUUID();
    const directory = join(this.updateRoot(), 'staged', jobId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const job: UpdateJobStatus = {
      schemaVersion: 1,
      jobId,
      version: release.version,
      phase: 'staged',
      message: null,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(
      join(directory, 'request.json'),
      `${JSON.stringify({ jobId, version: release.version })}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    return job;
  }

  private async initializeConfiguration(): Promise<void> {
    if (this.status.currentVersion !== '0.0.0') return;
    const repository = process.env.YEEN_UPDATE_REPOSITORY?.trim() || null;
    const channel =
      process.env.YEEN_UPDATE_CHANNEL === 'prerelease'
        ? 'prerelease'
        : 'stable';
    const currentVersion = await this.readCurrentVersion();
    const managedMode = await this.resolveManagedMode();
    this.patchStatus({
      currentVersion,
      repository:
        repository && REPOSITORY_PATTERN.test(repository) ? repository : null,
      channel,
      configured: Boolean(repository && REPOSITORY_PATTERN.test(repository)),
      managedMode,
      operatorCommand:
        managedMode === 'docker'
          ? 'docker compose pull && docker compose up -d'
          : null,
    });
  }

  private async resolveManagedMode(): Promise<
    'systemd' | 'docker' | 'unsupported'
  > {
    const explicit = process.env.YEEN_DEPLOYMENT_MODE?.trim().toLowerCase();
    if (explicit === 'docker') return 'docker';
    if (explicit === 'systemd') {
      const testOverride =
        process.env.NODE_ENV === 'test' &&
        process.env.YEEN_UPDATE_ALLOW_UNSUPPORTED_FOR_TESTS === 'true';
      return process.platform === 'linux' || testOverride
        ? 'systemd'
        : 'unsupported';
    }
    if (process.platform !== 'linux') return 'unsupported';
    if (process.env.container || process.env.DOCKER_CONTAINER === 'true')
      return 'docker';
    try {
      await access('/.dockerenv');
      return 'docker';
    } catch {
      return process.env.YEEN_SUPERVISED_RESTART === 'true'
        ? 'systemd'
        : 'unsupported';
    }
  }

  private async readCurrentVersion(): Promise<string> {
    const configured = process.env.YEEN_VERSION?.trim();
    if (configured) return normalizeSemanticVersion(configured) ?? '0.0.0';
    for (const fileName of ['release.json', 'package.json']) {
      try {
        const parsed = JSON.parse(
          await readFile(resolve(process.cwd(), fileName), 'utf8'),
        ) as { version?: string };
        if (parsed.version)
          return normalizeSemanticVersion(parsed.version) ?? '0.0.0';
      } catch {
        /* try the next immutable version source */
      }
    }
    return '0.0.0';
  }

  private assertReleaseAssetOrigins(release: SelectedGithubRelease): void {
    for (const asset of [release.archive, release.checksum, release.metadata]) {
      if (
        !this.status.repository ||
        !isAllowedGithubReleaseAssetUrl(
          this.status.repository,
          asset.browser_download_url,
        )
      ) {
        throw new Error(
          'GitHub release contains an asset URL outside the configured repository.',
        );
      }
    }
  }

  private githubHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Yeen-Updater/${this.status.currentVersion}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const token = process.env.YEEN_UPDATE_GITHUB_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  private updateRoot(): string {
    return resolve(
      process.env.YEEN_UPDATE_STAGING_ROOT?.trim() ||
        join(process.cwd(), 'data', 'updates'),
    );
  }

  private async writeLatestJob(job: UpdateJobStatus): Promise<void> {
    await mkdir(this.updateRoot(), { recursive: true, mode: 0o700 });
    await writeFile(
      join(this.updateRoot(), 'latest-job.json'),
      `${JSON.stringify({ jobId: job.jobId, version: job.version })}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
  }

  private async mergeExternalJobStatus(): Promise<void> {
    try {
      const latest = JSON.parse(
        await readFile(join(this.updateRoot(), 'latest-job.json'), 'utf8'),
      ) as { jobId: string; version: string };
      const external = JSON.parse(
        await readFile(
          join(this.externalStatusRoot(), `${basename(latest.jobId)}.json`),
          'utf8',
        ),
      ) as UpdateJobStatus;
      if (
        external.jobId !== latest.jobId ||
        external.version !== latest.version
      )
        return;
      if (
        external.phase === 'failed' ||
        external.phase === 'succeeded' ||
        external.phase === 'applying'
      ) {
        this.patchStatus({
          latestVersion: external.version,
          updateAvailable:
            external.phase !== 'succeeded' &&
            compareSemanticVersions(
              external.version,
              this.status.currentVersion,
            ) > 0,
          phase: external.phase,
          message: external.message,
        });
      }
    } catch {
      /* no completed external update job */
    }
  }

  private externalStatusRoot(): string {
    return resolve(
      process.env.YEEN_UPDATE_STATUS_ROOT?.trim() ||
        join(process.cwd(), 'data', 'update-status'),
    );
  }

  private withRuntimeStatus(): CoreUpdateStatus {
    return {
      ...this.status,
      activePlaybackCount:
        this.restartCoordinator.getStatus().activePlaybackCount,
    };
  }

  private patchStatus(patch: Partial<CoreUpdateStatus>): void {
    this.status = { ...this.status, ...patch };
  }

  private fail(error: unknown, fallback: string): void {
    const detail = error instanceof Error ? error.message : fallback;
    this.logger.error(detail);
    this.patchStatus({ phase: 'failed', message: detail || fallback });
  }
}
