#!/usr/bin/env node
/**
 * Release helper — bumps the version, folds a CHANGELOG section in, commits, tags,
 * pushes and opens the matching GitHub Release.
 *
 *   node scripts/release.mjs <version> "<one-line summary>" <notes-file> [--no-push]
 *
 * `notes-file` holds the Keep-a-Changelog body for this version (### Added / ### Fixed …).
 * It becomes both the CHANGELOG section and the body of the commit message and release.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [version, summary, notesFile, ...flags] = process.argv.slice(2);
if (!version || !summary || !notesFile) {
  console.error('usage: release.mjs <version> "<summary>" <notes-file> [--no-push]');
  process.exit(1);
}
const push = !flags.includes('--no-push');
const notes = readFileSync(notesFile, 'utf8').trim();
const today = new Date().toISOString().slice(0, 10);
const REPO = 'https://github.com/AmigoUK/Netcarve';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts });

// 1. package.json
const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const previous = pkg.version;
pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

// 2. CHANGELOG.md
const changelogPath = new URL('../CHANGELOG.md', import.meta.url);
let changelog = readFileSync(changelogPath, 'utf8');
if (!changelog.includes(`## [${version}]`)) {
  const anchor = `## [${previous}]`;
  const section = `## [${version}] — ${today}\n\n${notes}\n\n`;
  if (!changelog.includes(anchor)) {
    throw new Error(`CHANGELOG has no section for the previous version ${previous}`);
  }
  changelog = changelog.replace(anchor, section + anchor);
  changelog = changelog
    .replace(
      `[Unreleased]: ${REPO}/compare/v${previous}...HEAD`,
      `[Unreleased]: ${REPO}/compare/v${version}...HEAD\n[${version}]: ${REPO}/releases/tag/v${version}`,
    );
  writeFileSync(changelogPath, changelog);
}

// 3. commit, tag, push, release
const message = `chore(release): v${version} — ${summary}\n\n${notes}\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`;
run('git', ['add', '-A']);
run('git', ['commit', '-m', message]);
run('git', ['tag', '-a', `v${version}`, '-m', `v${version} — ${summary}`]);
if (push) {
  run('git', ['push', 'origin', 'main']);
  run('git', ['push', 'origin', `v${version}`]);
  run('gh', [
    'release',
    'create',
    `v${version}`,
    '--title',
    `v${version} — ${summary}`,
    '--notes',
    notes,
  ]);
}
console.log(`released v${version}`);
