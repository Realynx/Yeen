#!/usr/bin/env node

import { assertReleaseSigningEnvironment } from './android-build-guard.mjs';

try {
  const signing = await assertReleaseSigningEnvironment();
  console.log(`Android release signing configured with ${signing.keystorePath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
