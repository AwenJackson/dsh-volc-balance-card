#!/usr/bin/env node
// Pre-flight checks for shipping dsh-volc-balance-card to the DSH plugin
// market (awesome-dsh-plugin) and to npm.
//
// Why these checks: a submission is rejected when the package has no
// `dsh.bundle`, when official @deepseek-ai packages sit in `dependencies`
// instead of `peerDependencies`, when the repo lacks the `dsh-plugin` topic,
// or when the published npm tarball's `repository` does not point back to the
// listed repository. Those are all static, so they can be checked here.
//
// Usage:
//   node scripts/check-package.mjs           # warnings allowed
//   node scripts/check-package.mjs --strict  # warnings are fatal (prepublishOnly)
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

const failures = [];
const warnings = [];

const fail = (msg) => failures.push(msg);
const warn = (msg) => warnings.push(msg);

const readText = (rel) => readFileSync(join(root, rel), 'utf8');
const exists = (rel) => existsSync(join(root, rel));
const nonEmpty = (rel) => exists(rel) && statSync(join(root, rel)).size > 0;

let pkg;
try {
  pkg = JSON.parse(readText('package.json'));
} catch (error) {
  console.error('[fail] package.json is not valid JSON:', error.message);
  process.exit(1);
}

// --- identity ---------------------------------------------------------------
if (!/^[a-z0-9][a-z0-9._-]*$/.test(pkg.name ?? '')) fail('package name must be lowercase npm-safe');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version ?? '')) fail('package version must be semver');
if (!pkg.description || pkg.description.length < 40) fail('description should explain what the plugin does');
if (pkg.license !== 'MIT') warn(`license is ${pkg.license ?? 'missing'}; the upstream fork is MIT`);

// --- DSH installability (hard requirements of the curated list) -------------
if (!pkg.dsh || typeof pkg.dsh !== 'object') {
  fail('package.json must declare "dsh" (the curated list rejects packages without dsh.bundle)');
} else {
  const patch = pkg.dsh.bundle?.patch;
  if (typeof patch !== 'string' || !patch) fail('dsh.bundle.patch is required; dsh.client alone is not installable');
  else if (!exists(patch)) fail(`dsh.bundle.patch points to a missing file: ${patch}`);
  if (pkg.dsh.client?.platform !== 'web') warn('dsh.client.platform should be "web" for a sidebar card');
  if (!pkg.dsh.compatibility?.dsh) warn('dsh.compatibility.dsh is recommended so users see the supported host range');
}

if (!Array.isArray(pkg.keywords) || !pkg.keywords.includes('dsh-plugin')) {
  fail('keywords must include "dsh-plugin" (required by the curated list)');
}

// --- dependency hygiene -----------------------------------------------------
const deps = pkg.dependencies ?? {};
const official = Object.keys(deps).filter((name) => name.startsWith('@deepseek-ai/'));
if (official.length) fail(`official packages must be peerDependencies, not dependencies: ${official.join(', ')}`);

const peers = { ...(pkg.peerDependencies ?? {}) };
for (const name of Object.keys(peers)) {
  if (name.startsWith('@deepseek-ai/') && !peers[name].includes('||')) {
    warn(`peer ${name}: use explicit || branches so rc versions are not silently excluded`);
  }
}

// --- built artifacts --------------------------------------------------------
if (!nonEmpty('lib/index.js')) fail('lib/index.js is missing: run "npm run build"');
if (!nonEmpty('lib/client.js')) fail('lib/client.js is missing: run "npm run build"');
if (!nonEmpty('lib/vendor/schemastery.mjs')) fail('lib/vendor/schemastery.mjs is missing: run "npm run build"');
if (pkg.main && !exists(pkg.main)) fail(`main entry does not exist: ${pkg.main}`);
if (!pkg.exports?.['./client']) fail('exports["./client"] must expose the client entry');

if (nonEmpty('lib/client.js')) {
  const bundling = readText('lib/client.js');
  if (!bundling.includes('__ModuleLoader__.load')) fail('lib/client.js is not wrapped in window.__ModuleLoader__.load');
  if (!bundling.includes(pkg.name)) fail(`lib/client.js does not reference the plugin id ${pkg.name}`);
  if (/chatgpt/i.test(bundling)) warn('lib/client.js still mentions chatgpt (dead code from upstream)');
}

if (!nonEmpty('cordis.patch.yml')) fail('cordis.patch.yml is missing');
else if (!readText('cordis.patch.yml').includes(pkg.name)) fail(`cordis.patch.yml does not reference ${pkg.name}`);

// --- market metadata --------------------------------------------------------
const repoUrl = pkg.repository?.url ?? '';
if (/OWNER/i.test(repoUrl)) warn('repository still contains the OWNER placeholder: run "npm run set-repo -- <owner>/<repo>"');
if (!repoUrl) fail('repository.url is required so the curated registry can map npm releases to the repo');
else if (!/^git\+https:\/\/github\.com\/[^/]+\/[^/]+\.git$/.test(repoUrl)) warn(`repository.url looks unusual: ${repoUrl}`);

if (!pkg.homepage) warn('homepage is missing');
if (!pkg.bugs?.url) warn('bugs.url is missing');

if (!nonEmpty('README.md')) fail('README.md is required for the market listing');
if (!nonEmpty('README.zh.md')) warn('README.zh.md is recommended (Chinese-first users)');
if (!nonEmpty('LICENSE')) fail('LICENSE is required');
if (!nonEmpty('NOTICE')) warn('NOTICE should credit the upstream project this package forks');

// --- report -----------------------------------------------------------------
for (const msg of warnings) console.log(`[warn] ${msg}`);
for (const msg of failures) console.log(`[fail] ${msg}`);

const fatal = failures.length > 0 || (strict && warnings.length > 0);
if (fatal) {
  console.log(`\ncheck-package: ${failures.length} failure(s), ${warnings.length} warning(s)${strict ? ' (strict)' : ''}`);
  process.exit(1);
}
console.log(`\ncheck-package: ok (${warnings.length} warning(s))`);
