#!/usr/bin/env node
/**
 * Waits for CI on a commit and reports what it did.
 *
 *   node scripts/ci-status.mjs [sha] [--timeout-minutes 20] [--quiet]
 *
 * Exit codes: 0 green · 1 red · 2 no run appeared · 3 timed out.
 *
 * This exists because "green on my machine" is not the same claim as "green". Two releases
 * went out with failing CI before anyone looked, and the failure was real — a layout that
 * depended on the fonts of the machine that built it. `release.mjs` now blocks on this.
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const timeoutIndex = args.indexOf('--timeout-minutes');
const timeoutMinutes = timeoutIndex === -1 ? 20 : Number(args[timeoutIndex + 1]);
// `gh run list --commit` matches on the full hash, so a short one is expanded first.
const requested = args.find((arg) => /^[0-9a-f]{7,40}$/i.test(arg)) ?? 'HEAD';
const sha = execFileSync('git', ['rev-parse', requested], { encoding: 'utf8' }).trim();

const gh = (parameters) =>
  execFileSync('gh', parameters, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const say = (line) => {
  if (!quiet) console.log(line);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The most recent run for this commit, or undefined while GitHub has not registered one. */
function runFor(commit) {
  const raw = gh([
    'run',
    'list',
    '--commit',
    commit,
    '--limit',
    '1',
    '--json',
    'databaseId,status,conclusion,workflowName,url',
  ]);
  const [run] = JSON.parse(raw);
  return run;
}

/** Names of the steps that failed, so the report says what broke rather than that it broke. */
function failures(runId) {
  const { jobs } = JSON.parse(gh(['run', 'view', String(runId), '--json', 'jobs']));
  return jobs
    .filter((job) => job.conclusion === 'failure')
    .map((job) => ({
      job: job.name,
      steps: job.steps.filter((step) => step.conclusion === 'failure').map((step) => step.name),
    }));
}

const deadline = Date.now() + timeoutMinutes * 60_000;
/** GitHub takes a few seconds to register a run after a push; it never takes minutes. */
const appearBy = Date.now() + 120_000;
say(`Waiting for CI on ${sha.slice(0, 8)}…`);

let run = runFor(sha);
while (run === undefined && Date.now() < appearBy) {
  await sleep(5000);
  run = runFor(sha);
}

if (run === undefined) {
  console.error(`No CI run found for ${sha.slice(0, 8)}. Is the commit pushed?`);
  process.exit(2);
}

say(`  ${run.workflowName} — ${run.url}`);

while (run.status !== 'completed') {
  if (Date.now() > deadline) {
    console.error(`CI did not finish within ${timeoutMinutes} minutes: ${run.url}`);
    process.exit(3);
  }
  await sleep(15_000);
  run = runFor(sha) ?? run;
}

if (run.conclusion === 'success') {
  say(`✔ CI green on ${sha.slice(0, 8)}`);
  process.exit(0);
}

console.error(`\n✘ CI ${run.conclusion} on ${sha.slice(0, 8)}`);
for (const { job, steps } of failures(run.databaseId)) {
  console.error(`  job "${job}" failed at: ${steps.join(', ') || 'an unnamed step'}`);
}
console.error(`  ${run.url}`);
console.error(`  logs: gh run view ${run.databaseId} --log-failed`);
process.exit(1);
