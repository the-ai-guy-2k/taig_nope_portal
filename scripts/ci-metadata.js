#!/usr/bin/env node
'use strict';

/**
 * Records CI build metadata for workflow summaries and artifacts.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = process.env.CI_REPORT_DIR || path.join(ROOT, 'ci-reports');

const metadata = {
  recorded_at: new Date().toISOString(),
  repository: process.env.GITHUB_REPOSITORY || 'local',
  ref: process.env.GITHUB_REF || 'local',
  sha: process.env.GITHUB_SHA || 'local',
  run_id: process.env.GITHUB_RUN_ID || 'local',
  run_attempt: process.env.GITHUB_RUN_ATTEMPT || '1',
  workflow: process.env.GITHUB_WORKFLOW || 'local',
  actor: process.env.GITHUB_ACTOR || 'local',
  node_version: process.version,
  platform: `${process.platform}/${process.arch}`,
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(REPORT_DIR, 'build-metadata.json'),
  `${JSON.stringify(metadata, null, 2)}\n`,
  'utf8',
);

console.log('Build metadata recorded:');
console.log(`  SHA: ${metadata.sha.slice(0, 7)}`);
console.log(`  Ref: ${metadata.ref}`);
console.log(`  Run: ${metadata.run_id} (attempt ${metadata.run_attempt})`);
