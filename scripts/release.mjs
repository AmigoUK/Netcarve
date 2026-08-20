#!/usr/bin/env node
/**
 * Release helper — bumps the version, folds a CHANGELOG section in, builds the installable
 * archive, commits, tags, pushes and opens the matching GitHub Release with the archive
 * attached.
 *
 *   node scripts/release.mjs <version> "<one-line summary>" <notes-file> [--no-push] [--no-package] [--skip-ci]
 *
 * `notes-file` holds the Keep-a-Changelog body for this version (### Added / ### Fixed …).
 * It becomes both the CHANGELOG section and the body of the commit message and release.
 *
 * Every release carries `netcarve-<version>-chrome.zip`, so a reader of the releases page can
 * install the extension without a toolchain — see `docs/install.md`.
 *
 * **The tag is created only after CI passes on the pushed commit.** Two releases went out red
 * before anyone looked, and the failure was real. So the order is: commit, push, wait for CI,
 * and only then tag and publish. `--skip-ci` is the escape hatch for a repository without a
 * workflow.
 *
 * If CI fails, the commit stays on `main` untagged. Fix it, then run this again with the same
 * version — the CHANGELOG section and the version bump are already in place, so it will commit
 * the fix and pick up where it left off.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [version, summary, notesFile, ...flags] = process.argv.slice(2);
if (!version || !summary || !notesFile) {
  console.error(
    'usage: release.mjs <version> "<summary>" <notes-file> [--no-push] [--no-package]',
  );
  process.exit(1);
}
const push = !flags.includes('--no-push');
const packageArchive = !flags.includes('--no-package');
const waitForCi = push && !flags.includes('--skip-ci');
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

// 3. the installable archive — built after the bump so its manifest carries the new version
const archive = fileURLToPath(new URL(`../.output/netcarve-${version}-chrome.zip`, import.meta.url));
if (packageArchive) {
  run('npm', ['run', 'zip'], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (!existsSync(archive)) {
    throw new Error(`expected ${archive} after \`npm run zip\``);
  }
}

// 4. commit and push — the push is what starts CI
const message = `chore(release): v${version} — ${summary}\n\n${notes}\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`;
run('git', ['add', '-A']);
run('git', ['commit', '-m', message]);

if (push) {
  run('git', ['push', 'origin', 'main']);

  // 5. no tag, and no release, until the build is green somewhere other than this machine
  if (waitForCi) {
    try {
      execFileSync('node', [fileURLToPath(new URL('./ci-status.mjs', import.meta.url))], {
        stdio: 'inherit',
      });
    } catch {
      console.error(
        `\nv${version} was not tagged: CI failed on the commit just pushed.\n` +
          `Fix it, then run this again with the same version.`,
      );
      process.exit(1);
    }
  }

  run('git', ['tag', '-a', `v${version}`, '-m', `v${version} — ${summary}`]);
  run('git', ['push', 'origin', `v${version}`]);
  const body = `${notes}\n\n---\n\n### Install it\n\nDownload \`netcarve-${version}-chrome.zip\` below, unzip it, then in Chrome open \`chrome://extensions\`, turn on **Developer mode** and press **Load unpacked** on the unzipped folder. Full instructions, including Edge and updating an existing install: [docs/install.md](${REPO}/blob/v${version}/docs/install.md).\n\nTwo permissions, no host access, no network requests.`;

  run('gh', [
    'release',
    'create',
    `v${version}`,
    '--title',
    `v${version} — ${summary}`,
    '--notes',
    body,
    ...(packageArchive ? [`${archive}#NetCarve ${version} — unpacked extension (Chrome, Edge, Brave)`] : []),
  ]);
} else {
  run('git', ['tag', '-a', `v${version}`, '-m', `v${version} — ${summary}`]);
}
console.log(`released v${version}`);
