#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  savePreservationSnapshot,
  loadLatestSnapshot,
  validateSnapshot,
  restoreSnapshot,
  detectPreservation,
  getPreservationDir,
} = require('../src/services/localPreservation');

const ROOT = path.join(__dirname, '..');
const TEST_DIR = path.join(ROOT, '.tmp-preservation-test');

const GITIGNORE_REQUIRED = [
  'nebula_local/',
  '.nebula/',
  'aiw_local/',
  '*.local.md',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withTestDir(fn) {
  const previous = process.env.PRESERVATION_DIR;
  process.env.PRESERVATION_DIR = TEST_DIR;

  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  try {
    return fn();
  } finally {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    if (previous === undefined) {
      delete process.env.PRESERVATION_DIR;
    } else {
      process.env.PRESERVATION_DIR = previous;
    }
  }
}

function validateGitignore() {
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  const missing = GITIGNORE_REQUIRED.filter((entry) => !gitignore.includes(entry));

  if (missing.length > 0) {
    throw new Error(`.gitignore missing required entries: ${missing.join(', ')}`);
  }
}

function testSaveAndValidate() {
  withTestDir(() => {
    const saved = savePreservationSnapshot();
    assert(saved.current_job_order, 'Snapshot should include current job order');
    assert(saved.restore_status, 'Snapshot should include restore status');

    const loaded = loadLatestSnapshot();
    assert(loaded, 'loadLatestSnapshot should return data after save');

    const validation = validateSnapshot(loaded);
    assert(validation.valid, `Snapshot should be valid: ${validation.errors.join('; ')}`);

    const restored = restoreSnapshot();
    assert(restored.restored, 'restoreSnapshot should succeed');
    assert(restored.snapshot.restore_status.last_restored, 'Restore should set last_restored');
  });
}

function testMissingSnapshotGraceful() {
  withTestDir(() => {
    const loaded = loadLatestSnapshot();
    assert(loaded === null, 'Missing snapshot should return null');

    const validation = validateSnapshot(null);
    assert(!validation.valid, 'Validation should fail without snapshot');

    const restored = restoreSnapshot();
    assert(!restored.restored, 'Restore should fail gracefully without snapshot');

    const detection = detectPreservation();
    assert(!detection.snapshot_available, 'Detection should report no snapshot');
  });
}

function testInvalidJsonGraceful() {
  withTestDir(() => {
    savePreservationSnapshot();
    fs.writeFileSync(path.join(getPreservationDir(), 'current_job_order.json'), '{ invalid', 'utf8');

    const loaded = loadLatestSnapshot();
    assert(loaded, 'loadLatestSnapshot should still load restore_status when present');

    const validation = validateSnapshot(loaded);
    assert(!validation.valid, 'Invalid JSON should fail validation');
  });
}

function testRepositoryClean() {
  withTestDir(() => {
    savePreservationSnapshot();
  });

  const status = require('child_process').execSync('git status --porcelain', {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();

  if (status.includes('nebula_local') || status.includes('.tmp-preservation-test')) {
    throw new Error('Preservation artifacts must not appear in git status');
  }
}

function main() {
  const failures = [];

  try {
    validateGitignore();
    console.log('Gitignore preservation exclusions validated.');
  } catch (err) {
    failures.push(err.message);
  }

  try {
    testSaveAndValidate();
    console.log('Preservation save/load/validate/restore passed.');
  } catch (err) {
    failures.push(`Save/validate test failed: ${err.message}`);
  }

  try {
    testMissingSnapshotGraceful();
    console.log('Missing snapshot graceful handling passed.');
  } catch (err) {
    failures.push(`Missing snapshot test failed: ${err.message}`);
  }

  try {
    testInvalidJsonGraceful();
    console.log('Invalid JSON graceful handling passed.');
  } catch (err) {
    failures.push(`Invalid JSON test failed: ${err.message}`);
  }

  try {
    testRepositoryClean();
    console.log('Repository remains clean after preservation validation.');
  } catch (err) {
    failures.push(`Repository cleanliness test failed: ${err.message}`);
  }

  if (failures.length > 0) {
    console.error('Preservation validation failed:');
    failures.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log('All preservation validations passed.');
}

main();
