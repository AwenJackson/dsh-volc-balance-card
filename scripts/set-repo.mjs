#!/usr/bin/env node
// Fill in the GitHub owner/repo everywhere a package needs it before shipping:
// package.json (repository / homepage / bugs / author) and the ready-to-copy
// awesome-dsh-plugin submission file.
//
// Usage:
//   npm run set-repo -- your-github-name/dsh-volc-balance-card
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];

if (!arg || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(arg)) {
  console.error('usage: npm run set-repo -- <owner>/<repo>');
  process.exit(1);
}

const [owner, repo] = arg.split('/');
const slug = `${owner}__${repo}`;
const remote = `https://github.com/${owner}/${repo}`;

// --- package.json -----------------------------------------------------------
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.repository = { type: 'git', url: `git+${remote}.git` };
pkg.homepage = `${remote}#readme`;
pkg.bugs = { url: `${remote}/issues` };
pkg.author = owner;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log('[set-repo] package.json ->', pkg.repository.url);

// --- market submission file -------------------------------------------------
const marketDir = join(root, 'market');
const ymlPath = join(marketDir, `${slug}.yml`);
if (existsSync(marketDir)) {
  for (const name of readdirSync(marketDir)) {
    if (name.endsWith('.yml') && name !== `${slug}.yml`) {
      unlinkSync(join(marketDir, name));
      console.log('[set-repo] removed stale entry', name);
    }
  }
}

const yml = [
  `# Copy this file to data/plugins/${slug}.yml in the awesome-dsh-plugin repo.`,
  'url: ' + remote,
  `name: ${owner}/${repo}`,
  'category: usage',
  'description:',
  '  en: Persistent sidebar card for your Volcengine recharge balance and Ark Coding/Agent plan windows, with in-card AK/SK setup and per-provider toggles.',
  '  zh: 侧边栏常驻卡片，显示火山引擎账户充值余额与方舟 Coding/Agent 套餐窗口，内置 AK/SK 配置与逐项显示开关。',
  `tarball: ${remote}/releases/latest/download/dsh-volc-balance-card.tgz`,
  '',
].join('\n');
writeFileSync(ymlPath, yml, 'utf8');
console.log('[set-repo] wrote', join('market', `${slug}.yml`));
console.log('\nnext: git remote add origin', `git+${remote}.git`, '&& git push -u origin main');
