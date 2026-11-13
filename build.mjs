#!/usr/bin/env node
// Build script: src/*.ts -> lib/*.js (TypeScript, no bundler), then copy the
// vendored runtime helper (schemastery) into lib/vendor, because the emitted
// host bundle imports it by a relative path.
//
// The client entry (src/client.ts) is already wrapped in the
// window.__ModuleLoader__.load({ id, factory }) envelope that the DSH client
// runner expects, so tsc output is directly loadable — no bundling step.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

if (!existsSync(tsc)) {
  console.error('[build] typescript is not installed. Run: npm install');
  process.exit(1);
}

const res = spawnSync(process.execPath, [tsc, '--noCheck'], { cwd: root, stdio: 'inherit' });
if (res.error) {
  console.error('[build] failed to run tsc:', res.error.message);
  process.exit(1);
}
if (res.status !== 0) {
  console.error('[build] tsc exited with', res.status);
  process.exit(res.status ?? 1);
}

const srcVendor = join(root, 'src', 'vendor');
const libVendor = join(root, 'lib', 'vendor');
mkdirSync(libVendor, { recursive: true });
cpSync(srcVendor, libVendor, {
  recursive: true,
  filter: (file) => !/\.(ts|mts|cts)$/.test(file),
});

for (const rel of ['lib/index.js', 'lib/client.js', 'lib/vendor/schemastery.mjs']) {
  const abs = join(root, rel);
  if (!existsSync(abs) || statSync(abs).size === 0) {
    console.error('[build] missing or empty output:', rel);
    process.exit(1);
  }
}

console.log('[build] ok: lib/index.js, lib/client.js, lib/vendor/');
