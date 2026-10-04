import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const serverRoot = resolve(repositoryRoot, 'apps/server');
const requireFromServer = createRequire(resolve(serverRoot, 'package.json'));
const ts = requireFromServer('typescript');
const configPath = resolve(serverRoot, 'tsconfig.build.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const host = {
  getCanonicalFileName: (fileName) => relative(repositoryRoot, fileName),
  getCurrentDirectory: () => repositoryRoot,
  getNewLine: () => '\n',
};
if (configFile.error) {
  console.error(ts.formatDiagnosticsWithColorAndContext([configFile.error], host));
  process.exitCode = 1;
} else {
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath),
    { noEmit: true, incremental: false, tsBuildInfoFile: undefined }, configPath);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options,
    configFileParsingDiagnostics: parsed.errors });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
    process.exitCode = 1;
  } else {
    console.log(`Core TypeScript verification passed (${parsed.fileNames.length} files; no source rewriting or exclusions).`);
  }
}
