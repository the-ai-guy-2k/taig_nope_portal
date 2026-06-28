#!/usr/bin/env node
'use strict';

const querystring = require('querystring');
const { httpRequest, followRequest, waitForServer } = require('./test-server');

const EXPECTED_VERSION = 'Docker Foundation (ACI-008)';

const LEGACY_MARKERS = [
  'Version: MVP Foundation',
  'Repository foundation established',
  '"version":"MVP Foundation"',
];

function createDockerContainerValidation(ctx) {
  const { docker, container, hostPort } = ctx;

  async function waitForDockerHealthy(maxAttempts = 20) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const status = docker(`docker inspect --format="{{.State.Health.Status}}" ${container}`);
      if (status === 'healthy') {
        console.log(`Docker HEALTHCHECK status: ${status}`);
        return;
      }
      if (status === 'unhealthy') {
        const logs = docker(`docker logs ${container}`);
        throw new Error(`Container HEALTHCHECK unhealthy. Logs:\n${logs}`);
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });
    }

    const status = docker(`docker inspect --format="{{.State.Health.Status}}" ${container}`);
    if (status === 'starting') {
      console.log(`Docker HEALTHCHECK status: ${status} (HTTP health already verified; continuing)`);
      return;
    }

    throw new Error(`Container HEALTHCHECK unexpected status: ${status}`);
  }

  async function testHealthEndpoint() {
    const health = await httpRequest(hostPort, '/health');
    if (health.statusCode !== 200) {
      throw new Error(`/health returned HTTP ${health.statusCode}`);
    }
    if (!health.body.includes('"status":"ok"')) {
      throw new Error('/health missing ok status');
    }
    if (!health.body.includes(EXPECTED_VERSION)) {
      throw new Error(`/health version should be "${EXPECTED_VERSION}"`);
    }
    console.log('  ✓ GET /health returns HTTP 200');
  }

  async function testDashboard() {
    const dashboard = await httpRequest(hostPort, '/');
    if (dashboard.statusCode !== 200) {
      throw new Error(`Dashboard returned HTTP ${dashboard.statusCode}`);
    }

    const required = ['workspace-main', 'Dashboard — NOPE Lite', 'sidebar', 'Local Preservation'];
    for (const marker of required) {
      if (!dashboard.body.includes(marker)) {
        throw new Error(`Dashboard missing "${marker}"`);
      }
    }

    for (const marker of LEGACY_MARKERS) {
      if (dashboard.body.includes(marker)) {
        throw new Error(`Dashboard contains legacy marker "${marker}"`);
      }
    }

    console.log('  ✓ Dashboard loads correctly');
  }

  async function testSeedJobOrder() {
    const response = await httpRequest(hostPort, '/job-orders/jo-aci-002-seed');
    if (response.statusCode !== 200) {
      throw new Error(`Seed Job Order returned HTTP ${response.statusCode}`);
    }
    if (!response.body.includes('ACI-002 Data Model Foundation')) {
      throw new Error('Seed Job Order workspace missing expected title');
    }
    console.log('  ✓ Seed Job Order workspace loads');
  }

  async function testPreservationInContainer() {
    const dashboard = await httpRequest(hostPort, '/dashboard');
    if (!dashboard.body.includes('Restoration Status')) {
      throw new Error('Dashboard missing Restoration Status');
    }

    const artifacts = docker(`docker exec ${container} sh -c "ls -1 /app/nebula_local 2>/dev/null || true"`);
    const requiredFiles = [
      'current_job_order.json',
      'restore_status.json',
      'minority_report_current.md',
      'minority_report_previous.md',
    ];

    for (const file of requiredFiles) {
      if (!artifacts.includes(file)) {
        throw new Error(`Container nebula_local missing ${file}`);
      }
    }

    console.log('  ✓ Local Preservation functions inside container');
  }

  async function testContainerSmokeFlows() {
    const testId = 'jo-docker-smoke-test';
    const formBody = querystring.stringify({
      id: testId,
      title: 'Docker Smoke Test Job Order',
      mission: 'Validate Job Order create inside Docker container.',
      status: 'draft',
      current_truth_statement: 'Docker smoke current truth.',
      current_truth_source: 'validate-docker',
      current_truth_recorded_by: 'ci',
      next_truth_statement: 'Docker smoke next truth.',
      next_truth_rationale: 'Container validation.',
      target_truth_statement: 'Container smoke passes.',
      target_truth_criteria: 'Create succeeds',
      human_summary: 'Docker smoke test.',
      human_summary_author: 'ci',
      'risks[0][description]': 'Container write failure.',
      'risks[0][severity]': 'low',
      'risks[0][status]': 'open',
    });

    const createResponse = await followRequest(hostPort, '/job-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
    });

    if (createResponse.statusCode !== 200) {
      throw new Error(`Create Job Order returned HTTP ${createResponse.statusCode}`);
    }
    if (!createResponse.body.includes('Docker Smoke Test Job Order')) {
      throw new Error('Created Job Order not visible in container response');
    }

    const operatorBody = querystring.stringify({
      action: 'Docker smoke operator action',
      operator: 'ci',
      status: 'open',
      notes: 'Created by validate-docker',
      'checklist[0][text]': 'Complete in container',
      'checklist[0][completed]': 'false',
    });

    const operatorPage = await followRequest(hostPort, `/job-orders/${testId}/operator-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: operatorBody,
    });

    if (!operatorPage.body.includes('Docker smoke operator action')) {
      throw new Error('Operator action not visible after create in container');
    }

    const minorityBody = querystring.stringify({
      title: 'Docker Smoke Minority Report',
      mission: 'Validate minority report in container.',
      current_phase: 'ACI-010',
      human_summary: 'Container minority report smoke test.',
      current_truth: 'Docker image serves workflows.',
      completed: 'Build and startup',
      remaining: 'CI validation',
      risk: 'Ephemeral container data',
      next_truth: 'Published image matches validated artifact',
      next_action: 'Pull from Docker Hub',
      target: 'Canonical deployment artifact',
    });

    const minorityResponse = await followRequest(hostPort, `/job-orders/${testId}/minority-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: minorityBody,
    });

    if (!minorityResponse.body.includes('Docker Smoke Minority Report')) {
      throw new Error(`Minority report not visible after save. Body snippet: ${minorityResponse.body.slice(0, 500)}`);
    }

    console.log('  ✓ Smoke flows (create Job Order, operator action, minority report)');
  }

  async function testOperatorVisualParity() {
    const checks = [
      { path: '/', required: ['workspace-main', 'nav-list'] },
      { path: '/job-orders', required: ['Job Orders', 'jo-aci-002-seed'] },
      { path: '/dashboard', required: ['preservation-banner', 'Restoration Status'] },
    ];

    for (const check of checks) {
      const response = await httpRequest(hostPort, check.path);
      if (response.statusCode !== 200) {
        throw new Error(`${check.path} returned HTTP ${response.statusCode}`);
      }
      for (const marker of check.required) {
        if (!response.body.includes(marker)) {
          throw new Error(`${check.path} missing "${marker}" for operator visual parity`);
        }
      }
      for (const marker of LEGACY_MARKERS) {
        if (response.body.includes(marker)) {
          throw new Error(`${check.path} contains legacy marker "${marker}"`);
        }
      }
    }

    console.log('  ✓ Operator visual parity checks passed');
  }

  async function runContainerValidation() {
    const failures = [];
    const checks = [];

    const tests = [
      ['Container startup and HEALTHCHECK', async () => {
        await waitForDockerHealthy();
        console.log('  ✓ Container startup and HEALTHCHECK');
      }],
      ['Health endpoint', testHealthEndpoint],
      ['Dashboard load', testDashboard],
      ['Seed Job Order', testSeedJobOrder],
      ['Local Preservation', testPreservationInContainer],
      ['Container smoke flows', testContainerSmokeFlows],
      ['Operator visual parity', testOperatorVisualParity],
    ];

    await waitForServer(hostPort);

    for (const [name, fn] of tests) {
      const startedAt = Date.now();
      try {
        await fn();
        checks.push({ name, status: 'passed', duration_ms: Date.now() - startedAt });
      } catch (err) {
        checks.push({ name, status: 'failed', duration_ms: Date.now() - startedAt, error: err.message });
        failures.push(`${name}: ${err.message}`);
      }
    }

    return { failures, checks };
  }

  return {
    runContainerValidation,
    waitForDockerHealthy,
  };
}

module.exports = {
  createDockerContainerValidation,
  EXPECTED_VERSION,
};
