#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPORT_DIR = process.env.CI_REPORT_DIR || path.join(__dirname, '..', 'ci-reports');

function readJson(name) {
  const direct = path.join(REPORT_DIR, name);
  if (fs.existsSync(direct)) {
    return JSON.parse(fs.readFileSync(direct, 'utf8'));
  }

  function walk(dir) {
    if (!fs.existsSync(dir)) {
      return null;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === name) {
        return JSON.parse(fs.readFileSync(full, 'utf8'));
      }
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  return walk(REPORT_DIR);
}

function main() {
  const validate = readJson('validate-all.json');
  const docker = readJson('validate-docker.json');
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || 1);
  const failedRetryCount = Math.max(0, runAttempt - 1);

  const jobs = [];
  if (validate) {
    jobs.push({ name: 'Validation + Smoke Tests', ms: validate.total_ms || 0 });
  }
  if (docker) {
    jobs.push({ name: 'Docker Foundation Validation', ms: docker.total_ms || 0 });
  }

  const totalMs = jobs.reduce((sum, job) => sum + job.ms, 0);
  const sorted = [...jobs].sort((a, b) => b.ms - a.ms);
  const longest = sorted[0] || { name: 'n/a', ms: 0 };
  const fastest = sorted[sorted.length - 1] || { name: 'n/a', ms: 0 };

  const validateOk = validate?.status === 'passed';
  const dockerOk = !docker || docker?.status === 'passed';
  let reliabilityNote = 'All pipeline gates passed.';
  if (validate && !validateOk) {
    reliabilityNote = 'Validation + Smoke Tests failed. Review validate-all.json and job logs.';
  } else if (docker && !dockerOk) {
    reliabilityNote = 'Docker Foundation Validation failed. Review validate-docker.json and container logs.';
  } else if (!validate && !docker) {
    reliabilityNote = 'Pipeline reports incomplete. Review artifact uploads.';
  } else if (failedRetryCount > 0) {
    reliabilityNote = `Pipeline passed on retry attempt ${runAttempt}. Review prior failure logs for flake indicators.`;
  }

  const report = {
    recorded_at: new Date().toISOString(),
    total_ms: totalMs,
    longest_job: longest.name,
    longest_job_ms: longest.ms,
    fastest_job: fastest.name,
    fastest_job_ms: fastest.ms,
    failed_retry_count: failedRetryCount,
    reliability_note: reliabilityNote,
    jobs,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_DIR, 'pipeline-performance.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  console.log('Pipeline performance recorded:');
  console.log(`  Total: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`  Longest: ${longest.name} (${(longest.ms / 1000).toFixed(1)}s)`);
  console.log(`  Fastest: ${fastest.name} (${(fastest.ms / 1000).toFixed(1)}s)`);
  console.log(`  Failed retry count: ${failedRetryCount}`);
}

main();
