#!/usr/bin/env node
'use strict';

/**
 * Operator visual verification — validates HTML the way an operator sees it.
 * Runs against a freshly spawned server (CI port) to avoid stale-instance false positives.
 */

const { httpRequest, withTestServer } = require('./lib/test-server');

const PORT = Number(process.env.VALIDATE_PORT || 3099);

const LEGACY_MARKERS = [
  'Version: MVP Foundation',
  'Repository foundation established',
  '"version":"MVP Foundation"',
];

const CHECKS = [
  {
    name: 'Correct landing page',
    path: '/',
    required: ['workspace-main', 'Dashboard — NOPE Lite'],
    forbidden: LEGACY_MARKERS,
  },
  {
    name: 'Navigation visible',
    path: '/dashboard',
    required: ['sidebar', 'nav-list', 'Job Orders', 'Timeline'],
    forbidden: LEGACY_MARKERS,
  },
  {
    name: 'Expected UI rendered',
    path: '/job-orders',
    required: ['workspace-main', 'Job Orders', 'jo-aci-002-seed'],
    forbidden: LEGACY_MARKERS,
  },
  {
    name: 'Correct execution data displayed',
    path: '/job-orders/jo-aci-002-seed',
    required: ['ACI-002 Data Model Foundation', 'workspace-main'],
    forbidden: LEGACY_MARKERS,
  },
  {
    name: 'Restoration status correct',
    path: '/',
    required: ['Local Preservation', 'Restoration Status', 'preservation-banner'],
    forbidden: [],
  },
  {
    name: 'No stale application instance',
    path: '/health',
    required: ['"status":"ok"', 'Validation + Smoke Tests (ACI-007)'],
    forbidden: LEGACY_MARKERS,
  },
];

async function runVisualChecks() {
  const failures = [];
  let staleDetected = false;

  for (const check of CHECKS) {
    const response = await httpRequest(PORT, check.path);

    if (response.statusCode !== 200) {
      failures.push(`${check.name}: ${check.path} returned HTTP ${response.statusCode}`);
      continue;
    }

    for (const marker of check.required) {
      if (!response.body.includes(marker)) {
        failures.push(`${check.name}: missing expected content "${marker}" on ${check.path}`);
      }
    }

    for (const marker of check.forbidden) {
      if (response.body.includes(marker)) {
        staleDetected = true;
        failures.push(`${check.name}: stale/legacy content "${marker}" on ${check.path}`);
      }
    }
  }

  if (staleDetected) {
    console.error('');
    console.error('STALE APPLICATION CONTENT DETECTED');
    console.error('Responses include ACI-001 landing page markers.');
    console.error('');
  }

  return failures;
}

async function main() {
  console.log(`Operator visual verification on http://127.0.0.1:${PORT}...`);

  try {
    const failures = await withTestServer(PORT, {}, runVisualChecks);

    if (failures.length > 0) {
      console.error('Operator visual verification: FAIL');
      failures.forEach((item) => console.error(`  - ${item}`));
      process.exit(1);
    }

    console.log('Operator visual verification: PASS');
    console.log(`  Checks: ${CHECKS.length}`);
    console.log('  Observations: landing page, navigation, execution data, and restoration banner render correctly.');
    console.log('  Corrective actions taken: none (fresh server instance used).');
  } catch (err) {
    console.error(`Operator visual verification error: ${err.message}`);
    if (err.serverOutput) {
      console.error(err.serverOutput);
    }
    process.exit(1);
  }
}

main();
