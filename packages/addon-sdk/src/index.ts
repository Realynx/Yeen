/** Stable package format understood by Core Yeen's add-on host. */
export const YEEN_ADDON_MANIFEST_FILE = "yeen-addon.json" as const;
export const YEEN_ADDON_INTEGRITY_FILE = "integrity.json" as const;
export const YEEN_ADDON_SIGNATURE_FILE = "signature.json" as const;
export const YEEN_ADDON_PACKAGE_SCHEMA_VERSION = 1 as const;

/** Defensive package limits. The installer must enforce these while streaming. */
export const YEEN_ADDON_PACKAGE_LIMITS = {
  compressedBytes: 256 * 1024 * 1024,
  uncompressedBytes: 512 * 1024 * 1024,
  fileBytes: 128 * 1024 * 1024,
  files: 4096,
  compressionRatio: 200,
} as const;

export interface YeenAddonCoreCompatibility {
  minimumVersion: string;
  maximumVersionExclusive?: string;
}

export interface YeenAddonEntrypoints {
  /** Prebuilt CommonJS bundle. Dependencies other than the host SDK are bundled. */
  server?: string;
  /** Prebuilt browser ESM bundle loaded through the Core Yeen extension host. */
  web?: string;
}

export interface YeenAddonPlatform {
  os: "linux" | "darwin" | "win32";
  arch: "arm64" | "x64";
}

export interface YeenAddonManifestV1 {
  schemaVersion: typeof YEEN_ADDON_PACKAGE_SCHEMA_VERSION;
  id: string;
  name: string;
  version: string;
  addonApiVersion: number;
  core: YeenAddonCoreCompatibility;
  entrypoints: YeenAddonEntrypoints;
  permissions?: string[];
  platforms?: YeenAddonPlatform[];
}

export interface YeenAddonIntegrityFile {
  path: string;
  size: number;
  sha256: string;
}

export interface YeenAddonIntegrityV1 {
  schemaVersion: typeof YEEN_ADDON_PACKAGE_SCHEMA_VERSION;
  algorithm: "sha256";
  files: YeenAddonIntegrityFile[];
}

export interface YeenAddonSignatureV1 {
  schemaVersion: typeof YEEN_ADDON_PACKAGE_SCHEMA_VERSION;
  algorithm: "Ed25519";
  keyId: string;
  signed: typeof YEEN_ADDON_INTEGRITY_FILE;
  signature: string;
}

export type YeenRestartMode = "graceful" | "instant";

export interface YeenAddonRegistrationContext {
  addonId: string;
  addonVersion: string;
  dataDirectory: string;
}

/** Stable Nest injection tokens shared even when the SDK is bundled into a ZIP. */
export const YEEN_PROGRESSIVE_PLAYBACK_SOURCES = Symbol.for(
  "com.yeen.addons.progressive-playback-sources.v1",
);
export const YEEN_ADMIN_ACTIVITY_SOURCES = Symbol.for(
  "com.yeen.addons.admin-activity-sources.v1",
);
export const YEEN_LOCAL_MEDIA_INTAKE = Symbol.for(
  "com.yeen.addons.local-media-intake.v1",
);
export const YEEN_REMOTE_MUSIC_SOURCES = Symbol.for(
  "com.yeen.addons.remote-music-sources.v1",
);
export const YEEN_ADDON_SETTINGS = Symbol.for("com.yeen.addons.settings.v1");
export const YEEN_METADATA_COMMIT_PARTICIPANTS = Symbol.for(
  "com.yeen.addons.metadata-commit-participants.v1",
);

export interface YeenPlaybackMediaDescriptor {
  id: string;
  filePath: string;
}

export interface YeenProgressivePlaybackSourceRef {
  adapterId: string;
  sourceId: string;
  mayBePartial: boolean;
  compatibility: Record<string, string>;
}

export interface YeenProgressiveSegmentReadinessInput {
  filePath: string;
  segmentIndex: number;
  startSeconds: number;
  durationSeconds: number;
  totalDurationSeconds: number;
  fileSize: number;
}

export interface YeenProgressivePlaybackSourceAdapter {
  readonly adapterId: string;
  resolveSource(
    mediaId: string,
    filePath: string,
  ): Promise<YeenProgressivePlaybackSourceRef | null>;
  prioritize(source: YeenProgressivePlaybackSourceRef): Promise<void>;
  assertSegmentReadable(
    source: YeenProgressivePlaybackSourceRef,
    input: YeenProgressiveSegmentReadinessInput,
  ): Promise<void>;
  decoratePlaybackPlan(
    item: YeenPlaybackMediaDescriptor,
  ): Promise<Record<string, unknown>>;
}

export interface YeenProgressivePlaybackSourceRegistry {
  register(adapter: YeenProgressivePlaybackSourceAdapter): () => void;
}

export class YeenProgressiveSourceNotReadyError extends Error {
  readonly code = "YEEN_PROGRESSIVE_SOURCE_NOT_READY";

  constructor(message: string) {
    super(message);
    this.name = "YeenProgressiveSourceNotReadyError";
  }
}

export interface YeenExternalAdminActivityItem {
  externalId: string;
  mediaId: string | null;
  title: string;
  state: string;
  progressPercent: number;
}

export interface YeenAdminActivitySourceAdapter {
  readonly adapterId: string;
  listActiveItems(): Promise<YeenExternalAdminActivityItem[]>;
}

export interface YeenAdminActivitySourceRegistry {
  register(adapter: YeenAdminActivitySourceAdapter): () => void;
}

export interface YeenLocalMediaItemSnapshot {
  id: string;
  filePath: string;
  relativePath: string;
  title: string;
}

export interface YeenMediaLibraryLocation {
  path: string;
  type: "video" | "music";
}

export interface YeenLocalMediaItemIntake {
  findById(id: string): Promise<YeenLocalMediaItemSnapshot | null | undefined>;
  findByFilePath(
    filePath: string,
  ): Promise<YeenLocalMediaItemSnapshot | null | undefined>;
  listLibraryLocations(): Promise<string[]>;
  /** Additive typed alternative for add-ons that must select a music root. */
  listTypedLibraryLocations?(): Promise<YeenMediaLibraryLocation[]>;
  buildAbsoluteFileCandidates(input: {
    savePath: string;
    contentPath: string | null;
    sourceRelativePath: string;
  }): string[];
  probeFile(
    filePath: string,
    libraryRoot: string,
    hint?: Record<string, unknown>,
  ): Promise<YeenLocalMediaItemSnapshot>;
  upsert(item: YeenLocalMediaItemSnapshot): Promise<void>;
  refreshIfStale(
    item: YeenLocalMediaItemSnapshot,
    cooldownMs: number,
  ): Promise<void>;
}

export interface RemoteMusicExternalIds {
  theAudioDbTrackId?: string;
  theAudioDbAlbumId?: string;
  theAudioDbArtistId?: string;
  musicBrainzTrackId?: string;
  musicBrainzAlbumId?: string;
  musicBrainzArtistId?: string;
  spotifyId?: string;
  isrc?: string;
  [name: string]: string | undefined;
}

export interface RemoteMusicSource {
  provider: string;
  sourceId: string;
  url: string;
  playable: boolean;
  acquirable: boolean;
}

export interface RemoteMusicResult {
  id: string;
  title: string;
  artists: string[];
  album: string | null;
  durationSeconds: number | null;
  releaseYear: number | null;
  artworkUrl: string | null;
  externalIds: RemoteMusicExternalIds;
  sources: RemoteMusicSource[];
  localMediaId: string | null;
}

export interface RemoteMusicSourceSearchRequest {
  query: string;
  limit: number;
}

export interface RemoteMusicSourceDiscoverRequest {
  country: string;
  limit: number;
}

export interface YeenRemoteMusicSourceAdapter {
  readonly adapterId: string;
  readonly provider: string;
  search(request: RemoteMusicSourceSearchRequest): Promise<RemoteMusicResult[]>;
  discover?(
    request: RemoteMusicSourceDiscoverRequest,
  ): Promise<RemoteMusicResult[]>;
}

export interface YeenRemoteMusicSourceRegistry {
  register(adapter: YeenRemoteMusicSourceAdapter): () => void;
}

export interface YeenAddonSettings {
  get(addonId: string): Promise<Record<string, unknown>>;
  replace(
    addonId: string,
    settings: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  /** Import selected fields from Core Yeen's historical settings file once. */
  migrateLegacy(
    addonId: string,
    migration: {
      migrationId: string;
      fields: readonly string[];
    },
  ): Promise<Record<string, unknown>>;
}

export interface YeenMetadataCommitFileMove {
  mediaId: string;
  currentPath: string;
  targetPath: string;
  willMove: boolean;
  sidecars: Array<{ from: string; to: string }>;
}

export interface YeenMetadataCommitPlan {
  changes: YeenMetadataCommitFileMove[];
}

export interface YeenMetadataCommitResult {
  commitId: string;
  changes: Array<{
    mediaId: string;
    from: string;
    to: string;
    error?: string;
  }>;
}

export interface YeenMetadataCommitParticipantTransaction {
  complete(result: YeenMetadataCommitResult): Promise<void>;
  abort(error: unknown): Promise<void>;
}

export interface YeenMetadataCommitParticipant {
  readonly participantId: string;
  prepare(
    plan: YeenMetadataCommitPlan,
  ): Promise<YeenMetadataCommitParticipantTransaction | null>;
}

export interface YeenMetadataCommitParticipantRegistry {
  register(participant: YeenMetadataCommitParticipant): () => void;
}

/**
 * Opaque host module constructor. A Nest module class satisfies this shape,
 * while the public SDK stays independent from Nest packages and decorators.
 */
export interface YeenHostModule {
  readonly prototype: unknown;
}

export interface YeenServerAddonRegistration {
  nestModules?: YeenHostModule[];
}

/** A CommonJS server bundle exports one object with this shape. */
export interface YeenServerAddon {
  register(
    context: YeenAddonRegistrationContext,
  ):
    | YeenServerAddonRegistration
    | void
    | Promise<YeenServerAddonRegistration | void>;
}

export interface YeenWebAddonIdentity {
  id: string;
  name: string;
  version: string;
}

export type YeenWebClientExperience = "desktop" | "phone" | "tv";

export interface YeenWebExperienceElementTags {
  desktop?: string;
  phone?: string;
  tv?: string;
}

/** Core shell identity used to retain experience-specific layout and focus styling. */
export interface YeenWebExperiencePageKeys {
  desktop?: string;
  phone?: string;
  tv?: string;
}

/** Stable public role names; Core maps legacy stored account codes internally. */
export type YeenWebAccessRole = "administrator" | "downloader" | "standard";

export interface YeenWebRoleCriteria {
  allowedRoles?: YeenWebAccessRole[];
}

export interface YeenWebRouteContribution extends YeenWebRoleCriteria {
  id: string;
  path: string;
  title: string;
  elementTag: string;
  experienceElementTags?: YeenWebExperienceElementTags;
  experiencePageKeys?: YeenWebExperiencePageKeys;
  /** Core-owned chrome around the route. `admin` preserves each Client Experience's admin shell. */
  shell?: "content" | "admin";
  adminOnly?: boolean;
}

export interface YeenWebNavigationContribution extends YeenWebRoleCriteria {
  id: string;
  label: string;
  to: string;
  placement: "browse" | "admin" | "phone" | "profile";
  order?: number;
  adminOnly?: boolean;
}

export interface YeenWebSettingsSurfaceContribution extends YeenWebRoleCriteria {
  id: string;
  title: string;
  description?: string;
  elementTag: string;
  experienceElementTags?: YeenWebExperienceElementTags;
  placement: "user" | "system";
  order?: number;
  /** Optional stable anchor when the surface participates in categorized settings. */
  sectionId?: string;
  shortTitle?: string;
  note?: string;
}

export interface YeenWebMediaItemActionContribution extends YeenWebRoleCriteria {
  id: string;
  label: string;
  elementTag: string;
  experienceElementTags?: YeenWebExperienceElementTags;
  order?: number;
  placement?: "hero-actions" | "after-hero";
}

export interface YeenWebRemoteMusicResultActionContribution extends YeenWebRoleCriteria {
  id: string;
  label: string;
  elementTag: string;
  experienceElementTags?: YeenWebExperienceElementTags;
  order?: number;
  placement?: "card" | "details";
}

/** Non-action content placed at a stable location on a Media Item details page. */
export interface YeenWebMediaItemSurfaceContribution extends YeenWebRoleCriteria {
  id: string;
  elementTag: string;
  experienceElementTags?: YeenWebExperienceElementTags;
  placement: "after-hero";
  order?: number;
}

/** Non-interactive decoration rendered over every Core media card. */
export interface YeenWebMediaCardSurfaceContribution extends YeenWebRoleCriteria {
  id: string;
  elementTag: string;
  experienceElementTags?: YeenWebExperienceElementTags;
  order?: number;
}

export interface YeenWebPreparationSurfaceContribution extends YeenWebRoleCriteria {
  id: string;
  elementTag: string;
  experienceElementTags?: YeenWebExperienceElementTags;
  order?: number;
  /** Non-secret query parameter whose presence activates this full-page surface. */
  queryParameter?: string;
}

export interface YeenWebPlaybackStatusSurfaceContribution extends YeenWebRoleCriteria {
  id: string;
  elementTag: string;
  experienceElementTags?: YeenWebExperienceElementTags;
  order?: number;
}

export interface YeenWebAddonContributions {
  routes?: YeenWebRouteContribution[];
  navigation?: YeenWebNavigationContribution[];
  settingsSurfaces?: YeenWebSettingsSurfaceContribution[];
  mediaItemActions?: YeenWebMediaItemActionContribution[];
  remoteMusicResultActions?: YeenWebRemoteMusicResultActionContribution[];
  mediaItemSurfaces?: YeenWebMediaItemSurfaceContribution[];
  mediaCardSurfaces?: YeenWebMediaCardSurfaceContribution[];
  preparationSurfaces?: YeenWebPreparationSurfaceContribution[];
  playbackStatusSurfaces?: YeenWebPlaybackStatusSurfaceContribution[];
}

export interface YeenWebAddonStyle {
  id: string;
  cssText?: string;
  /** Same-origin stylesheet URL served from the installed add-on package. */
  href?: string;
}

/** HTMLElement constructors satisfy this without requiring DOM types in Node. */
export interface YeenCustomElementConstructor {
  readonly prototype: object;
  new (): object;
}

export interface YeenWebAddonContext {
  addon: YeenWebAddonIdentity;
  register(contributions: YeenWebAddonContributions): void;
  defineCustomElement(
    tagName: string,
    constructor: YeenCustomElementConstructor,
  ): void;
  addStyle(style: YeenWebAddonStyle): void;
}

export interface YeenAddonElementContext {
  accessToken: string | null;
  user: unknown;
  addonId: string;
  surface: string;
  clientExperience: YeenWebClientExperience;
  mediaItem?: unknown;
  remoteMusicResult?: unknown;
  preparation?: unknown;
  route?: {
    path: string;
    title: string;
  };
}

export interface YeenNavigateEventDetail {
  to: string;
  replace?: boolean;
}

export interface YeenMediaCardStateEventDetail {
  progressPercent?: number | null;
  tone?: "default" | "accent";
  label?: string | null;
}

/** Supported named-register browser bundle shape. */
export interface YeenWebAddon {
  register(context: YeenWebAddonContext): void | Promise<void>;
}

/** Supported default browser bundle export; preferred when both are present. */
export type YeenWebAddonInitializer = (
  context: YeenWebAddonContext,
) => void | Promise<void>;
