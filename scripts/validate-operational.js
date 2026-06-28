#!/usr/bin/env node
'use strict';

const {
  createJobOrder,
  deleteJobOrder,
  PersistenceError: JobOrderPersistenceError,
} = require('../src/services/jobOrderPersistence');
const {
  createOperatorAction,
  completeOperatorAction,
  getOperatorAction,
  PersistenceError: OperatorPersistenceError,
} = require('../src/services/operatorActionPersistence');
const {
  saveMinorityReport,
  getMinorityReportById,
  PersistenceError: MinorityPersistenceError,
} = require('../src/services/minorityReportPersistence');
const { getJobOrderById, loadAll } = require('../src/models/loader');
const { persistCollections } = require('../src/services/operationalHelpers');

const TEST_ID = 'jo-ci-operational-test';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cleanupTestJobOrder() {
  try {
    deleteJobOrder(TEST_ID);
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

function createTestJobOrder() {
  return createJobOrder({
    id: TEST_ID,
    title: 'CI Operational Test',
    mission: 'Validate operator actions and minority report workflows.',
    status: 'active',
    current_truth_statement: 'Operational test starting.',
    next_truth_statement: 'Operator workflows validated.',
    target_truth_statement: 'All operational tests pass.',
    human_summary: 'CI operational test job order.',
    human_summary_author: 'ci',
    risks: [],
  });
}

function minorityPayload(suffix) {
  return {
    title: `CI Minority Report ${suffix}`,
    mission: 'Validate minority report rotation.',
    current_phase: `Phase ${suffix}`,
    human_summary: `Human summary ${suffix}`,
    current_truth: `Current truth ${suffix}`,
    completed: 'Foundation complete',
    remaining: 'Operational validation',
    risk: 'Rotation failure',
    next_truth: 'Next truth validated',
    next_action: 'Run CI',
    target: 'Rotation works',
  };
}

function testOperatorActionWorkflow() {
  const action = createOperatorAction(TEST_ID, {
    action: 'CI test operator action',
    operator: 'ci',
    status: 'open',
    notes: 'Created by validate-operational',
    checklist: [{ text: 'Complete in CI', completed: false }],
  });

  assert(action.status === 'open', 'Created action should be open');

  const afterCreate = getOperatorAction(TEST_ID, action.id);
  assert(afterCreate, 'Read-after-write: operator action should exist');
  assert(afterCreate.action.includes('CI test'), 'Read-after-write: action text should match');

  const completed = completeOperatorAction(TEST_ID, action.id);
  assert(completed.status === 'completed', 'Complete should set status completed');
  assert(completed.completed_at, 'Complete should set completed_at');

  const afterComplete = getOperatorAction(TEST_ID, action.id);
  assert(afterComplete.status === 'completed', 'Read-after-write: status should be completed');
  assert(
    afterComplete.checklist.every((item) => item.completed),
    'Complete should mark checklist items done',
  );
}

function testMinorityReportRotation() {
  const first = saveMinorityReport(TEST_ID, minorityPayload('A'));
  let jobOrder = getJobOrderById(TEST_ID);
  assert(jobOrder.minority_report_current === first.id, 'First save should set current');
  assert(jobOrder.minority_report_previous === null, 'First save should have no previous');

  const second = saveMinorityReport(TEST_ID, minorityPayload('B'));
  jobOrder = getJobOrderById(TEST_ID);
  assert(jobOrder.minority_report_current === second.id, 'Second save should set new current');
  assert(jobOrder.minority_report_previous === first.id, 'Second save should rotate previous');

  const firstReport = getMinorityReportById(first.id);
  assert(firstReport.status === 'superseded', 'Rotated current should be superseded');

  const secondReport = getMinorityReportById(second.id);
  assert(secondReport.status === 'open', 'New report should be open');
}

function testValidationFailures() {
  const failures = [];

  try {
    createOperatorAction(TEST_ID, { action: '', operator: 'ci' });
    failures.push('Expected empty operator action to fail');
  } catch (err) {
    assert(err instanceof OperatorPersistenceError, 'Empty action should throw OperatorPersistenceError');
  }

  try {
    saveMinorityReport(TEST_ID, minorityPayload('X'));
    saveMinorityReport('jo-missing', minorityPayload('Y'));
    failures.push('Expected minority report on missing job order to fail');
  } catch (err) {
    assert(err instanceof MinorityPersistenceError, 'Missing job order should throw MinorityPersistenceError');
  }

  return failures;
}

function main() {
  const failures = [];

  cleanupTestJobOrder();

  try {
    createTestJobOrder();
    testOperatorActionWorkflow();
    console.log('Operator Action workflow validation passed.');

    testMinorityReportRotation();
    console.log('Minority Report rotation validation passed.');
  } catch (err) {
    failures.push(`Operational workflow test failed: ${err.message}`);
  } finally {
    cleanupTestJobOrder();
  }

  try {
    createTestJobOrder();
    const validationFailures = testValidationFailures();
    failures.push(...validationFailures);
    if (validationFailures.length === 0) {
      console.log('Operational validation failure tests passed.');
    }
  } catch (err) {
    failures.push(`Operational failure test error: ${err.message}`);
  } finally {
    cleanupTestJobOrder();
  }

  if (failures.length > 0) {
    console.error('Operational validation failed:');
    failures.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log('All operational validations passed.');
}

main();
