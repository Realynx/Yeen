import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { assertPublicFiles } from './public-policy.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
}).split('\0').filter(Boolean);
await assertPublicFiles(root, files);
console.log(`Public boundary verified (${files.length} tracked and unignored paths).`);
