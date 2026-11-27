#!/usr/bin/env node
'use strict';

/**
 * Shared helpers for the Giggit test scripts (giggit-*.js).
 *
 * Every script runs against an isolated server spawned from this repo:
 * - the live data dir (nebula_local/) is moved aside before the run and
 *   restored after, so a test run never touches real local data and never
 *   leaves test data behind. In CI the dir does not exist; the server seeds
 *   from data/giggit.json and the dir is removed afterwards.
 * - the spawned server runs with GIGGIT_ADMIN_TOKEN set to the test token
 *   and GIGGIT_TEST_MODE=1 (relaxed write throttle). The security script
 *   additionally spawns a normal-mode server to prove the real throttle.
 *
 * A test failure names the exact step, the exact input, and the exact
 * expected-vs-actual — the oopsie bar: breakage must be small and fixable.
 */

const fs = require('fs');
const path = require('path');
const { httpRequest, withTestServer, ROOT } = require('./lib/test-server');

const LIVE_DIR = path.join(ROOT, 'nebula_local');
const BACKUP_DIR = path.join(ROOT, '.tmp-giggit-test-backup');
const LIVE_FILE = path.join(LIVE_DIR, 'giggit.json');
const REPORT_DIR = process.env.CI_REPORT_DIR || path.join(ROOT, 'ci-reports');

const TEST_ADMIN_TOKEN = 'giggit-test-admin-token';

function spawnEnv() {
  return {
    GIGGIT_ADMIN_TOKEN: TEST_ADMIN_TOKEN,
    GIGGIT_TEST_MODE: '1',
  };
}

function backupLiveData() {
  if (fs.existsSync(BACKUP_DIR)) fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  if (fs.existsSync(LIVE_DIR)) fs.renameSync(LIVE_DIR, BACKUP_DIR);
}

function restoreLiveData() {
  if (fs.existsSync(LIVE_DIR)) fs.rmSync(LIVE_DIR, { recursive: true, force: true });
  if (fs.existsSync(BACKUP_DIR)) fs.renameSync(BACKUP_DIR, LIVE_DIR);
}

function readLiveFile() {
  return JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
}

function writeLiveFile(data) {
  fs.writeFileSync(LIVE_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/** Directly edit the live store file (time-travel for windows/rings). */
function tweakLiveData(mutate) {
  const data = readLiveFile();
  mutate(data);
  writeLiveFile(data);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function req(port, method, pathname, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await httpRequest(port, pathname, {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
  });
  let json = null;
  try { json = JSON.parse(res.body); } catch { /* plain-text or empty body */ }
  return { status: res.statusCode, headers: res.headers, body: res.body, json };
}

const adminHeaders = { 'x-giggit-admin-token': TEST_ADMIN_TOKEN };

function writeReport(name, results) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const passed = results.filter((r) => r.status === 'passed').length;
  const report = {
    recorded_at: new Date().toISOString(),
    suite: name,
    status: results.every((r) => r.status === 'passed' || r.status === 'known-gap')
      ? 'passed' : 'failed',
    passed,
    known_gaps: results.filter((r) => r.status === 'known-gap').length,
    failed: results.filter((r) => r.status === 'failed').length,
    checks: results,
  };
  fs.writeFileSync(
    path.join(REPORT_DIR, `giggit-${name}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  return report;
}

/**
 * Run a list of [name, fn] checks against a freshly spawned server.
 * Each check gets the port. Returns the results array and prints a list.
 * The process exits 0 when every check passed (or is a known gap), else 1.
 */
async function runSuite(name, port, checks, extraEnv = {}) {
  const results = [];
  backupLiveData();
  try {
    await withTestServer(port, { ...spawnEnv(), ...extraEnv }, async () => {
      for (const [checkName, fn] of checks) {
        try {
          const detail = await fn(port);
          results.push({ name: checkName, status: 'passed', detail: detail || '' });
          console.log(`  ✓ ${checkName}`);
        } catch (err) {
          if (err && err.knownGap) {
            results.push({ name: checkName, status: 'known-gap', detail: err.message });
            console.log(`  ◐ ${checkName} (known gap: ${err.message})`);
          } else {
            results.push({ name: checkName, status: 'failed', detail: err.message });
            console.error(`  ✗ ${checkName}: ${err.message}`);
          }
        }
      }
    });
  } finally {
    restoreLiveData();
  }
  const report = writeReport(name, results);
  console.log(`\n${name}: ${report.passed} passed, ${report.known_gaps} known gaps, ${report.failed} failed.`);
  process.exit(report.status === 'passed' ? 0 : 1);
}

/** Mark a check as a known gap instead of a failure (documented, not faked). */
function knownGap(message) {
  const err = new Error(message);
  err.knownGap = true;
  return err;
}

module.exports = {
  ROOT,
  LIVE_FILE,
  TEST_ADMIN_TOKEN,
  spawnEnv,
  adminHeaders,
  backupLiveData,
  restoreLiveData,
  readLiveFile,
  writeLiveFile,
  tweakLiveData,
  assert,
  assertEq,
  req,
  writeReport,
  runSuite,
  knownGap,
  withTestServer,
  httpRequest,
};
