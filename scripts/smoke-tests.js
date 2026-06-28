#!/usr/bin/env node
'use strict';

/**
 * End-to-end smoke tests for NOPE Lite.
 * Spawns an isolated server instance and exercises HTTP workflows.
 */

const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { followRequest, httpRequest, withTestServer, ROOT } = require('./lib/test-server');
const { deleteJobOrder } = require('../src/services/jobOrderPersistence');
const {
  listOperatorActionsForJobOrder,
} = require('../src/services/operatorActionPersistence');
const { getJobOrderById, loadAll } = require('../src/models/loader');
const { persistCollections } = require('../src/services/operationalHelpers');

const PORT = Number(process.env.SMOKE_PORT || 3100);
const TEST_ID = 'jo-smoke-test';
const PRESERVATION_DIR = path.join(ROOT, '.tmp-smoke-preservation');

const LEGACY_MARKERS = [
  'Version: MVP Foundation',
  'Repository foundation established',
  '"version":"MVP Foundation"',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cleanupTestData() {
  try {
    if (getJobOrderById(TEST_ID)) {
      deleteJobOrder(TEST_ID);
    }
  } catch {
    // ignore
  }

  const collections = loadAll();
  collections.operator_actions = collections.operator_actions.filter(
    (item) => item.job_order_id !== TEST_ID,
  );
  collections.minority_reports = collections.minority_reports.filter(
    (item) => item.job_order_id !== TEST_ID,
  );
  persistCollections(collections);
}

function jobOrderForm(overrides = {}) {
  return {
    id: TEST_ID,
    title: 'Smoke Test Job Order',
    mission: 'End-to-end smoke test for Job Order create and edit.',
    status: 'draft',
    current_truth_statement: 'Smoke test current truth.',
    current_truth_source: 'smoke-tests',
    current_truth_recorded_by: 'ci',
    next_truth_statement: 'Smoke test next truth.',
    next_truth_rationale: 'Validation coverage.',
    target_truth_statement: 'All smoke tests pass.',
    target_truth_criteria: 'Create succeeds\nEdit succeeds',
    human_summary: 'Smoke test job order.',
    human_summary_author: 'ci',
    'risks[0][description]': 'Smoke test risk.',
    'risks[0][severity]': 'low',
    'risks[0][status]': 'open',
    ...overrides,
  };
}

function minorityForm(suffix) {
  return {
    title: `Smoke Minority Report ${suffix}`,
    mission: 'Validate minority report via HTTP smoke test.',
    current_phase: `Phase ${suffix}`,
    human_summary: `Human summary ${suffix}`,
    current_truth: `Current truth ${suffix}`,
    completed: 'Smoke create and edit',
    remaining: 'Operator actions and rotation',
    risk: 'HTTP form encoding mismatch',
    next_truth: 'Rotation validated',
    next_action: 'Complete smoke suite',
    target: 'E2E coverage',
  };
}

async function testApplicationStartup() {
  const health = await httpRequest(PORT, '/health');
  assert(health.statusCode === 200, `Health should return 200, got ${health.statusCode}`);
  assert(health.body.includes('"status":"ok"'), 'Health should report ok status');
  assert(
    health.body.includes('Docker Foundation (ACI-008)'),
    'Health version should reflect ACI-008',
  );

  for (const marker of LEGACY_MARKERS) {
    assert(!health.body.includes(marker), `Health should not contain legacy marker: ${marker}`);
  }

  console.log('  ✓ Application startup and health endpoint');
}

async function testDashboardLoad() {
  const dashboard = await httpRequest(PORT, '/');
  assert(dashboard.statusCode === 200, `Dashboard should return 200, got ${dashboard.statusCode}`);
  assert(dashboard.body.includes('workspace-main'), 'Dashboard should render workspace-main');
  assert(dashboard.body.includes('sidebar'), 'Dashboard should render navigation sidebar');
  assert(dashboard.body.includes('Local Preservation'), 'Dashboard should show preservation banner');

  for (const marker of LEGACY_MARKERS) {
    assert(!dashboard.body.includes(marker), `Dashboard should not contain legacy marker: ${marker}`);
  }

  console.log('  ✓ Dashboard load');
}

async function testSeedJobOrder() {
  const response = await httpRequest(PORT, '/job-orders/jo-aci-002-seed');
  assert(response.statusCode === 200, `Seed Job Order should return 200, got ${response.statusCode}`);
  assert(
    response.body.includes('ACI-002 Data Model Foundation'),
    'Seed Job Order workspace should show seed title',
  );

  console.log('  ✓ Seed Job Order workspace');
}

async function testCreateJobOrder() {
  const body = querystring.stringify(jobOrderForm());
  const response = await followRequest(PORT, '/job-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  assert(response.statusCode === 200, `Create redirect should land on 200, got ${response.statusCode}`);
  assert(response.body.includes('Smoke Test Job Order'), 'Created Job Order should appear in workspace');

  const persisted = getJobOrderById(TEST_ID);
  assert(persisted, 'Read-after-write: created Job Order should exist in data store');

  console.log('  ✓ Create Job Order');
}

async function testEditJobOrder() {
  const body = querystring.stringify(jobOrderForm({
    title: 'Smoke Test Job Order Updated',
    mission: 'Updated mission from smoke test edit.',
    status: 'active',
    passdown_summary: 'Smoke passdown summary.',
    passdown_handed_off_by: 'ci',
  }));

  const response = await followRequest(PORT, `/job-orders/${TEST_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  assert(response.statusCode === 200, `Edit redirect should land on 200, got ${response.statusCode}`);
  assert(
    response.body.includes('Smoke Test Job Order Updated'),
    'Edited Job Order title should appear in workspace',
  );

  const persisted = getJobOrderById(TEST_ID);
  assert(persisted.status === 'active', 'Read-after-write: status should be active after edit');
  assert(persisted.passdown?.summary === 'Smoke passdown summary.', 'Read-after-write: passdown should persist');

  console.log('  ✓ Edit Job Order');
}

async function testOperatorActions() {
  const createBody = querystring.stringify({
    action: 'Smoke test operator action',
    operator: 'ci',
    status: 'open',
    notes: 'Created by smoke-tests',
    'checklist[0][text]': 'Complete in smoke test',
    'checklist[0][completed]': 'false',
  });

  const createResponse = await followRequest(PORT, `/job-orders/${TEST_ID}/operator-actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: createBody,
  });

  assert(createResponse.statusCode === 200, 'Operator action create should redirect to 200');
  assert(
    createResponse.body.includes('Smoke test operator action'),
    'Operator actions page should list created action',
  );

  const actions = listOperatorActionsForJobOrder(TEST_ID);
  const created = actions.find((item) => item.action.includes('Smoke test operator action'));
  assert(created, 'Read-after-write: operator action should exist in data store');

  const completeBody = querystring.stringify({ intent: 'complete' });
  const completeResponse = await followRequest(
    PORT,
    `/job-orders/${TEST_ID}/operator-actions/${created.id}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: completeBody,
    },
  );

  assert(completeResponse.statusCode === 200, 'Operator action complete should redirect to 200');
  assert(
    completeResponse.body.includes('completed') || completeResponse.body.includes('Completed'),
    'Completed action should be visible on operator actions page',
  );

  console.log('  ✓ Operator Actions create and complete');
}

async function testMinorityReport() {
  const body = querystring.stringify(minorityForm('smoke'));
  const response = await followRequest(PORT, `/job-orders/${TEST_ID}/minority-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  assert(response.statusCode === 200, `Minority report save should redirect to 200, got ${response.statusCode}`);
  assert(
    response.body.includes('Smoke Minority Report smoke'),
    'Job Order workspace should show saved minority report title',
  );

  const jobOrder = getJobOrderById(TEST_ID);
  assert(jobOrder.minority_report_current, 'Read-after-write: minority_report_current should be set');

  console.log('  ✓ Minority Report save');
}

async function testRestoration() {
  const dashboard = await httpRequest(PORT, '/dashboard');
  assert(dashboard.statusCode === 200, 'Dashboard should return 200 for restoration check');
  assert(dashboard.body.includes('Restoration Status'), 'Dashboard should display Restoration Status');
  assert(dashboard.body.includes('preservation-banner'), 'Dashboard should render preservation banner');

  const restoreStatusPath = path.join(PRESERVATION_DIR, 'restore_status.json');
  assert(fs.existsSync(restoreStatusPath), 'Preservation restore_status.json should exist after startup');

  console.log('  ✓ Restoration metadata on dashboard');
}

async function runSmokeTests() {
  const failures = [];

  cleanupTestData();

  const tests = [
    ['Application startup', testApplicationStartup],
    ['Dashboard load', testDashboardLoad],
    ['Seed Job Order', testSeedJobOrder],
    ['Create Job Order', testCreateJobOrder],
    ['Edit Job Order', testEditJobOrder],
    ['Operator Actions', testOperatorActions],
    ['Minority Report', testMinorityReport],
    ['Restoration', testRestoration],
  ];

  for (const [name, fn] of tests) {
    try {
      await fn();
    } catch (err) {
      failures.push(`${name}: ${err.message}`);
    }
  }

  cleanupTestData();

  if (fs.existsSync(PRESERVATION_DIR)) {
    fs.rmSync(PRESERVATION_DIR, { recursive: true, force: true });
  }

  return failures;
}

async function main() {
  console.log(`Running smoke tests on http://127.0.0.1:${PORT}...`);

  if (fs.existsSync(PRESERVATION_DIR)) {
    fs.rmSync(PRESERVATION_DIR, { recursive: true, force: true });
  }

  try {
    const failures = await withTestServer(PORT, {
      PRESERVATION_DIR,
    }, runSmokeTests);

    if (failures.length > 0) {
      console.error('Smoke tests failed:');
      failures.forEach((item) => console.error(`  - ${item}`));
      process.exit(1);
    }

    console.log('All smoke tests passed (9 scenarios).');
  } catch (err) {
    console.error(`Smoke test error: ${err.message}`);
    if (err.serverOutput) {
      console.error(err.serverOutput);
    }
    cleanupTestData();
    process.exit(1);
  }
}

main();
