#!/usr/bin/env node
'use strict';

/**
 * Runs the complete NOPE Lite validation suite in dependency order.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = process.env.CI_REPORT_DIR || path.join(ROOT, 'ci-reports');

const SUITE = [
  { label: 'Repository structure', file: 'scripts/validate-structure.js' },
  { label: 'JavaScript syntax', file: 'scripts/validate-syntax.js' },
  { label: 'Data integrity', file: 'scripts/validate-data.js' },
  { label: 'Workflow persistence', file: 'scripts/validate-workflow.js' },
  { label: 'Operational workflows', file: 'scripts/validate-operational.js' },
  { label: 'Local preservation', file: 'scripts/validate-preservation.js' },
  { label: 'Route availability', file: 'scripts/validate-routes.js' },
  { label: 'End-to-end smoke tests', file: 'scripts/smoke-tests.js' },
  { label: 'Operator visual verification', file: 'scripts/validate-operator-visual.js' },
];

function writeReport(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_DIR, 'validate-all.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

function runStep(step) {
  console.log('');
  console.log(`=== ${step.label} ===`);

  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [path.join(ROOT, step.file)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  const durationMs = Date.now() - startedAt;

  return {
    label: step.label,
    file: step.file,
    status: result.status === 0 ? 'passed' : 'failed',
    duration_ms: durationMs,
    exit_code: result.status,
  };
}

function main() {
  console.log('NOPE Lite — complete validation suite');
  const startedAt = Date.now();
  const stages = [];
  let failedStage = null;

  for (const step of SUITE) {
    const result = runStep(step);
    stages.push(result);
    if (result.status !== 'passed') {
      failedStage = result.label;
      break;
    }
  }

  const totalMs = Date.now() - startedAt;
  const report = {
    recorded_at: new Date().toISOString(),
    status: failedStage ? 'failed' : 'passed',
    failed_stage: failedStage,
    total_ms: totalMs,
    stage_count: SUITE.length,
    stages,
  };

  writeReport(report);

  console.log('');
  if (failedStage) {
    console.error(`Validation suite FAILED at: ${failedStage} (${(totalMs / 1000).toFixed(1)}s)`);
    process.exit(1);
  }

  console.log(`Validation suite PASSED (${SUITE.length} stages, ${(totalMs / 1000).toFixed(1)}s)`);
}

main();
