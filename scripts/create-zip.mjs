import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ZipArchive } from 'archiver';

const sourcePackageJson = JSON.parse(
  await readFile(path.resolve('package.json'), 'utf8'),
);
const artifactsDir = path.resolve('artifacts');
const zipPath = path.join(artifactsDir, `${sourcePackageJson.name}-deploy.zip`);

await mkdir(artifactsDir, { recursive: true });

await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = new ZipArchive({
    zlib: { level: 9 },
  });

  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);

  archive.pipe(output);
  archive.directory(path.resolve('deploy'), false);
  archive.finalize();
});

console.log(`Created ${zipPath}`);