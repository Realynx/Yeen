import { NotFoundException } from '@nestjs/common';
import { isAbsolute, relative, resolve } from 'node:path';

interface ResolveSafePathOptions {
  basePath: string;
  fileName: string;
  invalidFileNameMessage: string;
  invalidPathMessage: string;
  fileNamePattern?: RegExp;
}

const DEFAULT_FILE_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

function isInsideBasePath(basePath: string, targetPath: string): boolean {
  const relativePath = relative(basePath, targetPath);

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
}

export function resolveSafePathFromFileName(
  options: ResolveSafePathOptions,
): string {
  const pattern = options.fileNamePattern ?? DEFAULT_FILE_NAME_PATTERN;
  if (!pattern.test(options.fileName)) {
    throw new NotFoundException(options.invalidFileNameMessage);
  }

  const resolvedBasePath = resolve(options.basePath);
  const resolvedTargetPath = resolve(resolvedBasePath, options.fileName);

  if (!isInsideBasePath(resolvedBasePath, resolvedTargetPath)) {
    throw new NotFoundException(options.invalidPathMessage);
  }

  return resolvedTargetPath;
}
