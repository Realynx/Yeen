import type { TmdbRemoteCandidate } from '../remote-metadata/tmdb-metadata.service';
import type { JikanRemoteCandidate } from '../remote-metadata/jikan-metadata.service';
import type { JikanMetadataService } from '../remote-metadata/jikan-metadata.service';
import type { TmdbMetadataService } from '../remote-metadata/tmdb-metadata.service';

export function buildRemoteSearchProbesValue(
  query: string,
  requestedTags: readonly string[],
): string[] {
  const probes = new Set<string>();

  const addProbe = (value: string) => {
    const cleaned = value.trim();
    if (cleaned.length >= 2) {
      probes.add(cleaned);
    }
  };

  addProbe(query);

  for (const tag of requestedTags) {
    addProbe(tag);

    const tokenized = tag
      .split(/[^a-z0-9]+/i)
      .map((value) => value.trim())
      .filter((value) => value.length >= 3)
      .slice(0, 4);

    if (tokenized.length >= 2) {
      addProbe(tokenized.join(' '));
    }
  }

  return [...probes].slice(0, 4);
}

export async function collectTmdbRemoteCandidatesValue(
  searchProbes: readonly string[],
  providerLimit: number,
  useCache: boolean,
  tmdbMetadataService: TmdbMetadataService,
): Promise<TmdbRemoteCandidate[]> {
  const candidates: TmdbRemoteCandidate[] = [];

  for (const probe of searchProbes) {
    const payload = await tmdbMetadataService.searchRemoteCandidates({
      title: probe,
      limit: providerLimit,
      useCache,
    });
    candidates.push(...payload);
  }

  return candidates;
}

export async function collectJikanRemoteCandidatesValue(
  searchProbes: readonly string[],
  providerLimit: number,
  useCache: boolean,
  jikanMetadataService: JikanMetadataService,
): Promise<JikanRemoteCandidate[]> {
  const candidates: JikanRemoteCandidate[] = [];

  for (const probe of searchProbes) {
    const payload = await jikanMetadataService.searchCandidates({
      title: probe,
      limit: providerLimit,
      useCache,
    });
    candidates.push(...payload);
  }

  return candidates;
}

export async function collectTmdbRemoteTagCandidatesValue(
  tags: readonly string[],
  providerLimit: number,
  useCache: boolean,
  page: number,
  tmdbMetadataService: TmdbMetadataService,
): Promise<TmdbRemoteCandidate[]> {
  const candidates: TmdbRemoteCandidate[] = [];

  for (const tag of tags) {
    const payload =
      await tmdbMetadataService.searchRemoteCandidatesByTag({
        tag,
        limit: providerLimit,
        useCache,
        page,
      });
    candidates.push(...payload);
  }

  return candidates;
}

export async function collectJikanRemoteTagCandidatesValue(
  tags: readonly string[],
  providerLimit: number,
  useCache: boolean,
  page: number,
  jikanMetadataService: JikanMetadataService,
): Promise<JikanRemoteCandidate[]> {
  const candidates: JikanRemoteCandidate[] = [];

  for (const tag of tags) {
    const payload = await jikanMetadataService.searchCandidatesByTag({
      tag,
      limit: providerLimit,
      useCache,
      page,
    });
    candidates.push(...payload);
  }

  return candidates;
}
