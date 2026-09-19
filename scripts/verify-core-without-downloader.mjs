import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const repositoryRoot = resolve(import.meta.dirname, '..');
const serverRoot = resolve(repositoryRoot, 'apps/server');
const serverSourceRoot = resolve(serverRoot, 'src');
const appModulePath = resolve(serverSourceRoot, 'app.module.ts');
const requireFromServer = createRequire(resolve(serverRoot, 'package.json'));
const ts = requireFromServer('typescript');

const downloaderImplementationPaths = [
  resolve(serverSourceRoot, 'domains/downloader-builtin'),
  resolve(serverSourceRoot, 'domains/torrent'),
  resolve(
    serverSourceRoot,
    'domains/media/application/services/torrent-search',
  ),
  resolve(
    serverSourceRoot,
    'domains/media/application/services/torrent-intake',
  ),
  resolve(
    serverSourceRoot,
    'domains/stream/application/services/hls/torrent-data-availability.service.ts',
  ),
  resolve(
    serverSourceRoot,
    'domains/auth/presentation/guards/torrent-access.guard.ts',
  ),
].map(normalizePath);

const compatibilityBlocks = [
  'downloader-builtin import',
  'downloader-builtin registration',
];

function normalizePath(filePath) {
  return resolve(filePath).replaceAll('\\', '/').toLowerCase();
}

function isDownloaderImplementationPath(filePath) {
  const candidate = normalizePath(filePath);
  return downloaderImplementationPaths.some(
    (implementationPath) =>
      candidate === implementationPath ||
      candidate.startsWith(`${implementationPath}/`),
  );
}

function removeCompatibilityBlock(source, name) {
  const begin = `// CORE_ONLY_VERIFICATION:BEGIN ${name}`;
  const end = `// CORE_ONLY_VERIFICATION:END ${name}`;
  const beginIndex = source.indexOf(begin);
  const endIndex = source.indexOf(end);

  if (beginIndex === -1 && endIndex === -1) return source;
  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new Error(`Malformed Core-only compatibility markers for ${name}`);
  }
  if (
    source.indexOf(begin, beginIndex + begin.length) !== -1 ||
    source.indexOf(end, endIndex + end.length) !== -1
  ) {
    throw new Error(`Duplicate Core-only compatibility markers for ${name}`);
  }

  const lineStart = source.lastIndexOf('\n', beginIndex - 1) + 1;
  const endLineBreak = source.indexOf('\n', endIndex + end.length);
  return `${source.slice(0, lineStart)}${
    endLineBreak === -1 ? '' : source.slice(endLineBreak + 1)
  }`;
}

function coreOnlyAppModule(source) {
  let patched = source;
  for (const block of compatibilityBlocks) {
    patched = removeCompatibilityBlock(patched, block);
  }

  if (
    /DownloaderBuiltinModule|domains\/downloader-builtin|domains\\downloader-builtin/.test(
      patched,
    )
  ) {
    throw new Error(
      'Unmarked DownloaderBuiltinModule wiring remains in apps/server/src/app.module.ts',
    );
  }
  return patched;
}

const configPath = resolve(serverRoot, 'tsconfig.build.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error(ts.formatDiagnosticsWithColorAndContext([configFile.error], diagnosticHost()));
  process.exitCode = 1;
} else {
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(configPath),
    { noEmit: true, incremental: false, tsBuildInfoFile: undefined },
    configPath,
  );
  const configDiagnostics = parsed.errors;
  const rootNames = parsed.fileNames.filter(
    (fileName) => !isDownloaderImplementationPath(fileName),
  );
  const excludedCount = parsed.fileNames.length - rootNames.length;
  const host = ts.createCompilerHost(parsed.options);
  const readSource = host.readFile.bind(host);
  const sourceExists = host.fileExists.bind(host);

  host.fileExists = (fileName) =>
    !isDownloaderImplementationPath(fileName) && sourceExists(fileName);
  host.readFile = (fileName) => {
    if (isDownloaderImplementationPath(fileName)) return undefined;
    const source = readSource(fileName);
    if (source === undefined || normalizePath(fileName) !== normalizePath(appModulePath)) {
      return source;
    }
    return coreOnlyAppModule(source);
  };
  host.getSourceFile = (fileName, languageVersion) => {
    const source = host.readFile(fileName);
    if (source === undefined) return undefined;
    return ts.createSourceFile(fileName, source, languageVersion, true);
  };

  const program = ts.createProgram({
    rootNames,
    options: parsed.options,
    host,
    configFileParsingDiagnostics: configDiagnostics,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length > 0) {
    console.error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, diagnosticHost()),
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Core-only TypeScript verification passed (${rootNames.length} files compiled; ${excludedCount} Downloader implementation files omitted).`,
    );
  }
}

function diagnosticHost() {
  return {
    getCanonicalFileName: (fileName) => relative(repositoryRoot, fileName),
    getCurrentDirectory: () => repositoryRoot,
    getNewLine: () => '\n',
  };
}
