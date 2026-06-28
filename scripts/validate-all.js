#!/usr/bin/env node
'use strict';

/**
 * Runs the complete NOPE Lite validation suite in dependency order.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

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

function runStep(step) {
  console.log('');
  console.log(`=== ${step.label} ===`);

  const result = spawnSync(process.execPath, [path.join(ROOT, step.file)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  return result.status === 0;
}

function main() {
  console.log('NOPE Lite — complete validation suite (ACI-007)');
  const startedAt = Date.now();
  const failures = [];

  for (const step of SUITE) {
    if (!runStep(step)) {
      failures.push(step.label);
      break;
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('');
  if (failures.length > 0) {
    console.error(`Validation suite FAILED at: ${failures[0]} (${elapsed}s)`);
    process.exit(1);
  }

  console.log(`Validation suite PASSED (${SUITE.length} stages, ${elapsed}s)`);
}

main();
