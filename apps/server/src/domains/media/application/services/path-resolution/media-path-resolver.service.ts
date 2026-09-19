import { Injectable } from '@nestjs/common';
import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

export interface MediaPathResolverContext {
  roots: string[];
}

@Injectable()
export class MediaPathResolverService {
  buildExternalAbsoluteFileCandidates(input: {
    savePath: string;
    contentPath: string | null;
    sourceRelativePath: string;
  }): string[] {
    const normalizedRelativePath = input.sourceRelativePath
      .trim()
      .replace(/\\/g, '/');
    if (!normalizedRelativePath) {
      return [];
    }

    const candidates: string[] = [];
    const seen = new Set<string>();

    const addCandidate = (candidatePath: string) => {
      const resolved = resolve(candidatePath);
      const key = resolved.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(resolved);
      }
    };

    addCandidate(resolve(input.savePath, normalizedRelativePath));
    addCandidate(resolve(input.savePath, basename(normalizedRelativePath)));

    if (input.contentPath) {
      const resolvedContentPath = resolve(input.contentPath);
      const parentContentPath = dirname(resolvedContentPath);
      const relativeFirstSegment =
        normalizedRelativePath.split('/').find((segment) => segment.trim()) ??
        '';

      addCandidate(resolve(resolvedContentPath, normalizedRelativePath));
      addCandidate(resolve(parentContentPath, normalizedRelativePath));
      addCandidate(
        resolve(resolvedContentPath, basename(normalizedRelativePath)),
      );

      if (
        relativeFirstSegment &&
        basename(resolvedContentPath).toLowerCase() ===
          relativeFirstSegment.toLowerCase()
      ) {
        addCandidate(resolve(parentContentPath, normalizedRelativePath));
      }

      if (
        basename(resolvedContentPath).toLowerCase() ===
        basename(normalizedRelativePath).toLowerCase()
      ) {
        addCandidate(resolvedContentPath);
      }
    }

    return candidates;
  }

  buildMediaFilePathCandidates(
    importedFilePath: string,
    relativePath: string,
    context: MediaPathResolverContext,
  ): string[] {
    const deduped = new Set<string>();
    const relativeSegments = relativePath
      .replace(/[\\/]+/g, '/')
      .split('/')
      .filter(Boolean);

    const pushCandidate = (candidate: string) => {
      const cleaned = candidate.trim();
      if (!cleaned) {
        return;
      }

      deduped.add(resolve(cleaned));
    };

    if (relativeSegments.length > 0) {
      for (const root of context.roots) {
        const rootLabel = basename(root).trim().toLowerCase();

        if (
          rootLabel &&
          relativeSegments[0].toLowerCase() === rootLabel &&
          relativeSegments.length > 1
        ) {
          pushCandidate(resolve(root, ...relativeSegments.slice(1)));
        }

        pushCandidate(resolve(root, ...relativeSegments));
      }
    }

    const trimmedImportedPath = importedFilePath.trim();
    if (trimmedImportedPath) {
      if (isAbsolute(trimmedImportedPath)) {
        pushCandidate(trimmedImportedPath);
      } else if (context.roots.length > 0) {
        for (const root of context.roots) {
          pushCandidate(resolve(root, trimmedImportedPath));
        }
      } else {
        pushCandidate(trimmedImportedPath);
      }

      if (!trimmedImportedPath.endsWith('.!qB')) {
        const legacyPartialVariant = `${trimmedImportedPath}.!qB`;
        if (isAbsolute(legacyPartialVariant)) {
          pushCandidate(legacyPartialVariant);
        } else if (context.roots.length > 0) {
          for (const root of context.roots) {
            pushCandidate(resolve(root, legacyPartialVariant));
          }
        }
      }
    }

    return [...deduped];
  }

  async resolveRelativePathFuzzy(
    relativePath: string,
    context: MediaPathResolverContext,
  ): Promise<string | null> {
    const normalized = relativePath
      .replace(/[\\/]+/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .trim();

    if (!normalized) {
      return null;
    }

    const segments = normalized.split('/').filter(Boolean);
    if (segments.length === 0) {
      return null;
    }

    for (const root of context.roots) {
      const options: string[][] = [segments];
      const rootLabel = basename(root).trim().toLowerCase();
      if (
        rootLabel &&
        segments.length > 1 &&
        segments[0].toLowerCase() === rootLabel
      ) {
        options.push(segments.slice(1));
      }

      for (const optionSegments of options) {
        const resolved = await this.tryResolvePathUnderRoot(
          root,
          optionSegments,
        );
        if (resolved) {
          return resolved;
        }
      }
    }

    return null;
  }

  private async tryResolvePathUnderRoot(
    root: string,
    segments: string[],
  ): Promise<string | null> {
    if (segments.length === 0) {
      return null;
    }

    let current = resolve(root);

    for (let index = 0; index < segments.length; index += 1) {
      const expected = segments[index];
      const isLast = index === segments.length - 1;
      const matchedName = await this.findPathEntryMatch(
        current,
        expected,
        !isLast,
      );

      if (!matchedName) {
        return null;
      }

      current = resolve(current, matchedName);
    }

    return (await this.fileExists(current)) ? current : null;
  }

  private async findPathEntryMatch(
    directoryPath: string,
    expectedName: string,
    expectDirectory: boolean,
  ): Promise<string | null> {
    let entries: Dirent[];

    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      return null;
    }

    const filtered = entries.filter((entry) =>
      expectDirectory ? entry.isDirectory() : entry.isFile(),
    );

    if (filtered.length === 0) {
      return null;
    }

    const exact = filtered.find((entry) => entry.name === expectedName);
    if (exact) {
      return exact.name;
    }

    const expectedLower = expectedName.toLowerCase();
    const caseInsensitive = filtered.filter(
      (entry) => entry.name.toLowerCase() === expectedLower,
    );
    if (caseInsensitive.length === 1) {
      return caseInsensitive[0].name;
    }

    const expectedToken = this.normalizePathToken(expectedName);
    if (!expectedToken) {
      return null;
    }

    const tokenMatches = filtered.filter(
      (entry) => this.normalizePathToken(entry.name) === expectedToken,
    );

    if (tokenMatches.length === 1) {
      return tokenMatches[0].name;
    }

    return null;
  }

  private normalizePathToken(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const fileStats = await stat(filePath);
      return fileStats.isFile();
    } catch {
      return false;
    }
  }
}
