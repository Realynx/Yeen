import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

const [action, dataDirArg, backupDirArg] = process.argv.slice(2);
if (!['validate', 'backup', 'restore'].includes(action) || !dataDirArg) {
  throw new Error(
    'Usage: production-data.mjs <validate|backup|restore> <data-dir> [backup-dir]',
  );
}

const dataDir = path.resolve(dataDirArg);

function isSafeJsonFileName(value) {
  return typeof value === 'string'
    && value.endsWith('.json')
    && path.basename(value) === value
    && value !== '.'
    && value !== '..';
}

async function readJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = [];
  for (const entry of entries) {
    if (!entry.name.endsWith('.json')) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`JSON state is not a regular file: ${entry.name}`);
    }
    JSON.parse(await readFile(path.join(directory, entry.name), 'utf8'));
    names.push(entry.name);
  }
  return names.sort();
}

async function resolveConfiguredSqlitePath(settingsDirectory) {
  let configuredPath = 'data/media-metadata.sqlite';
  try {
    const settings = JSON.parse(
      await readFile(path.join(settingsDirectory, 'system-settings.json'), 'utf8'),
    );
    if (
      typeof settings.mediaMetadataSqlitePath === 'string'
      && settings.mediaMetadataSqlitePath.trim()
    ) {
      configuredPath = settings.mediaMetadataSqlitePath.trim();
    }
  } catch {
    // Missing settings use the application default; malformed JSON is rejected above.
  }
  return path.isAbsolute(configuredPath)
    ? path.resolve(configuredPath)
    : path.resolve(path.dirname(dataDir), configuredPath);
}

function validateSqlite(sqlitePath, readonly) {
  const db = new Database(sqlitePath, { readonly, fileMustExist: true });
  try {
    const quickCheck = db.pragma('quick_check', { simple: true });
    if (quickCheck !== 'ok') {
      throw new Error(`SQLite quick_check failed: ${String(quickCheck)}`);
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

async function assertRegularFile(filePath, label) {
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label} is not a regular file.`);
  }
}

async function moveIfPresent(source, destination) {
  try {
    await lstat(source);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  await rename(source, destination);
}

function validateBackupManifest(manifest, backupDir) {
  if (
    manifest?.policy !== 'production-data-source-of-truth'
    || path.resolve(String(manifest.sourceDataDir ?? '')) !== dataDir
    || !Array.isArray(manifest.jsonFiles)
    || manifest.jsonFiles.some((name) => !isSafeJsonFileName(name))
    || manifest.jsonFiles.includes('backup-manifest.json')
    || new Set(manifest.jsonFiles).size !== manifest.jsonFiles.length
  ) {
    throw new Error('Backup manifest does not match the authoritative data directory.');
  }
  const sqliteBackupPath = path.join(backupDir, 'media-metadata.sqlite');
  if (path.resolve(String(manifest.sqliteBackupPath ?? '')) !== sqliteBackupPath) {
    throw new Error('Backup manifest contains an unexpected SQLite backup path.');
  }
  return { jsonFiles: [...manifest.jsonFiles].sort(), sqliteBackupPath };
}

async function validateBackupContents(backupDir, jsonFiles, sqliteBackupPath) {
  const backupEntries = await readJsonFiles(backupDir);
  const allowedBackupJson = [...jsonFiles, 'backup-manifest.json'].sort();
  if (JSON.stringify(backupEntries) !== JSON.stringify(allowedBackupJson)) {
    throw new Error('Backup JSON contents do not match the manifest.');
  }
  await assertRegularFile(sqliteBackupPath, 'SQLite backup');
  validateSqlite(sqliteBackupPath, true).close();
}

async function validateCurrentState(sqlitePath) {
  const currentEntries = await readdir(dataDir, { withFileTypes: true });
  for (const entry of currentEntries) {
    if (entry.name.endsWith('.json') && (!entry.isFile() || entry.isSymbolicLink())) {
      throw new Error(`Current JSON state is not a regular file: ${entry.name}`);
    }
  }
  for (const candidate of [sqlitePath, `${sqlitePath}-wal`, `${sqlitePath}-shm`]) {
    try {
      const stats = await lstat(candidate);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error(`Current SQLite state is not a regular file: ${candidate}`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return currentEntries;
}

async function stageBackupFiles(backupDir, jsonFiles, sqliteBackupPath, sqlitePath, restoreId) {
  const stagedJson = [];
  for (const fileName of jsonFiles) {
    const stagedPath = path.join(dataDir, `.${fileName}.restore-${restoreId}`);
    await copyFile(path.join(backupDir, fileName), stagedPath);
    await chmod(stagedPath, 0o600);
    stagedJson.push([fileName, stagedPath]);
  }
  const stagedSqlite = `${sqlitePath}.restore-${restoreId}`;
  await copyFile(sqliteBackupPath, stagedSqlite);
  await chmod(stagedSqlite, 0o600);
  return { stagedJson, stagedSqlite };
}

async function quarantineCurrentState(currentEntries, sqlitePath, quarantineDir) {
  for (const entry of currentEntries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      await rename(path.join(dataDir, entry.name), path.join(quarantineDir, entry.name));
    }
  }
  await moveIfPresent(sqlitePath, path.join(quarantineDir, 'media-metadata.sqlite'));
  await moveIfPresent(`${sqlitePath}-wal`, path.join(quarantineDir, 'media-metadata.sqlite-wal'));
  await moveIfPresent(`${sqlitePath}-shm`, path.join(quarantineDir, 'media-metadata.sqlite-shm'));
}

async function restoreBackup(backupDir) {
  const manifestPath = path.join(backupDir, 'backup-manifest.json');
  await assertRegularFile(manifestPath, 'Backup manifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const { jsonFiles, sqliteBackupPath } = validateBackupManifest(manifest, backupDir);
  const sqlitePath = await resolveConfiguredSqlitePath(backupDir);
  if (path.resolve(String(manifest.sourceSqlitePath ?? '')) !== sqlitePath) {
    throw new Error('Backup manifest contains an unexpected SQLite target path.');
  }
  await validateBackupContents(backupDir, jsonFiles, sqliteBackupPath);
  await mkdir(path.dirname(sqlitePath), { recursive: true, mode: 0o750 });
  const currentEntries = await validateCurrentState(sqlitePath);

  const restoreId = `${Date.now()}-${process.pid}`;
  const quarantineDir = path.join(backupDir, `failed-runtime-${restoreId}`);
  await mkdir(quarantineDir, { mode: 0o700 });
  const { stagedJson, stagedSqlite } = await stageBackupFiles(
    backupDir, jsonFiles, sqliteBackupPath, sqlitePath, restoreId,
  );
  await quarantineCurrentState(currentEntries, sqlitePath, quarantineDir);
  for (const [fileName, stagedPath] of stagedJson) {
    await rename(stagedPath, path.join(dataDir, fileName));
  }
  await rename(stagedSqlite, sqlitePath);
  validateSqlite(sqlitePath, true).close();
  return jsonFiles.length;
}

if (action === 'restore') {
  if (!backupDirArg) throw new Error('Backup directory is required for restore action.');
  const restoredCount = await restoreBackup(path.resolve(backupDirArg));
  console.log(`restore completed for production data (${restoredCount} JSON files).`);
  process.exit(0);
}

const jsonFiles = await readJsonFiles(dataDir);
if (jsonFiles.includes('backup-manifest.json')) {
  throw new Error('Authoritative data cannot use the reserved backup-manifest.json name.');
}
const sqlitePath = await resolveConfiguredSqlitePath(dataDir);
await assertRegularFile(sqlitePath, 'Configured metadata database');
const db = validateSqlite(sqlitePath, action === 'validate');
try {
  if (action === 'backup') {
    if (!backupDirArg) throw new Error('Backup directory is required for backup action.');
    const backupDir = path.resolve(backupDirArg);
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    await chmod(backupDir, 0o700);
    const sqliteBackupPath = path.join(backupDir, 'media-metadata.sqlite');
    await db.backup(sqliteBackupPath);

    for (const fileName of jsonFiles) {
      await copyFile(path.join(dataDir, fileName), path.join(backupDir, fileName));
    }

    await writeFile(
      path.join(backupDir, 'backup-manifest.json'),
      `${JSON.stringify({
        createdAt: new Date().toISOString(),
        sourceDataDir: dataDir,
        sourceSqlitePath: sqlitePath,
        sqliteBackupPath,
        jsonFiles,
        policy: 'production-data-source-of-truth',
      }, null, 2)}\n`,
    );
    const backupFiles = await readdir(backupDir, { withFileTypes: true });
    await Promise.all(
      backupFiles
        .filter((entry) => entry.isFile())
        .map((entry) => chmod(path.join(backupDir, entry.name), 0o600)),
    );
  }
} finally {
  db.close();
}

console.log(`${action} completed for production data (${jsonFiles.length} JSON files).`);
