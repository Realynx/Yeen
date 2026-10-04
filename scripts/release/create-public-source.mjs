import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import { assertPublicFiles } from './public-policy.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const candidates = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
}).split('\0').filter(Boolean);
await assertPublicFiles(root, candidates);
const files = [];
for (const file of new Set(candidates)) {
  try {
    if ((await lstat(path.join(root, file))).isFile()) files.push(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const destination = path.join(root, 'artifacts/yeen-public-source.zip');
await mkdir(path.dirname(destination), { recursive: true });
await new Promise((resolve, reject) => {
  const output = createWriteStream(destination);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.on('warning', reject);
  archive.pipe(output);
  for (const file of files) archive.file(path.join(root, file), { name: file });
  archive.finalize().catch(reject);
});
console.log(`Created ${destination} (${files.length} public files; no Git history).`);
