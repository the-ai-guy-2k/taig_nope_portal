#!/usr/bin/env node
'use strict';

const {
  createJobOrder,
  updateJobOrder,
  deleteJobOrder,
  PersistenceError,
} = require('../src/services/jobOrderPersistence');
const { getJobOrderById, loadAndValidate } = require('../src/models/loader');

const TEST_ID = 'jo-ci-workflow-test';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validCreatePayload(overrides = {}) {
  return {
    id: TEST_ID,
    title: 'CI Workflow Test Job Order',
    mission: 'Validate create, update, and read-after-write persistence.',
    status: 'draft',
    current_truth_statement: 'Initial current truth for CI workflow test.',
    current_truth_source: 'validate-workflow',
    current_truth_recorded_by: 'ci',
    next_truth_statement: 'Next truth after create.',
    next_truth_rationale: 'Workflow validation.',
    target_truth_statement: 'Target truth for workflow test.',
    target_truth_criteria: 'Create succeeds\nUpdate succeeds',
    human_summary: 'CI workflow test job order.',
    human_summary_author: 'ci',
    risks: [
      {
        description: 'Test risk for workflow validation.',
        severity: 'low',
        status: 'open',
      },
    ],
    ...overrides,
  };
}

function testValidationFailures() {
  const failures = [];

  try {
    createJobOrder(validCreatePayload({ id: 'jo-aci-002-seed' }));
    failures.push('Expected duplicate ID create to fail');
  } catch (err) {
    assert(err instanceof PersistenceError, 'Duplicate ID should throw PersistenceError');
  }

  try {
    createJobOrder(validCreatePayload({ mission: '' }));
    failures.push('Expected missing mission create to fail');
  } catch (err) {
    assert(err instanceof PersistenceError, 'Missing mission should throw PersistenceError');
  }

  try {
    updateJobOrder('jo-does-not-exist', validCreatePayload({ id: 'jo-does-not-exist' }));
    failures.push('Expected update of missing job order to fail');
  } catch (err) {
    assert(err instanceof PersistenceError, 'Missing job order update should throw PersistenceError');
  }

  return failures;
}

function testCreateReadUpdate() {
  if (getJobOrderById(TEST_ID)) {
    deleteJobOrder(TEST_ID);
  }

  const created = createJobOrder(validCreatePayload());
  assert(created.id === TEST_ID, 'Create should return test job order');
  assert(created.mission.includes('Validate create'), 'Create should persist mission');

  const afterCreate = getJobOrderById(TEST_ID, loadAndValidate());
  assert(afterCreate, 'Read-after-write: job order should exist after create');
  assert(afterCreate.title === 'CI Workflow Test Job Order', 'Read-after-write: title should match');

  const updated = updateJobOrder(TEST_ID, validCreatePayload({
    title: 'CI Workflow Test Job Order Updated',
    mission: 'Updated mission for read-after-write validation.',
    status: 'active',
    passdown_summary: 'Handoff summary for CI test.',
    passdown_next_steps: 'Verify passdown persisted',
    passdown_handed_off_by: 'ci',
  }));

  assert(updated.title === 'CI Workflow Test Job Order Updated', 'Update should change title');
  assert(updated.status === 'active', 'Update should change status');
  assert(updated.passdown?.summary === 'Handoff summary for CI test.', 'Update should persist passdown');

  const afterUpdate = getJobOrderById(TEST_ID, loadAndValidate());
  assert(afterUpdate.mission === 'Updated mission for read-after-write validation.', 'Read-after-write: mission should match update');
  assert(afterUpdate.timeline.length >= 2, 'Update should append timeline reference');

  deleteJobOrder(TEST_ID);
  assert(!getJobOrderById(TEST_ID), 'Cleanup should remove test job order');
}

function main() {
  const failures = [];

  try {
    testCreateReadUpdate();
    console.log('Workflow create/update/read-after-write validation passed.');
  } catch (err) {
    failures.push(`Workflow test failed: ${err.message}`);
    try {
      deleteJobOrder(TEST_ID);
    } catch {
      // ignore cleanup errors
    }
  }

  try {
    const validationFailures = testValidationFailures();
    failures.push(...validationFailures);
    if (validationFailures.length === 0) {
      console.log('Workflow validation failure tests passed.');
    }
  } catch (err) {
    failures.push(`Validation failure test error: ${err.message}`);
  }

  if (failures.length > 0) {
    console.error('Workflow validation failed:');
    failures.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log('All workflow validations passed.');
}

main();
