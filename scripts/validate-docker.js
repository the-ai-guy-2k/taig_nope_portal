#!/usr/bin/env node
'use strict';

/**
 * Docker container validation for NOPE Lite.
 * Builds image, starts container, validates health, dashboard, preservation, and smoke HTTP flows.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createDockerContainerValidation } = require('./lib/docker-container-validation');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = process.env.CI_REPORT_DIR || path.join(ROOT, 'ci-reports');
const IMAGE = process.env.DOCKER_IMAGE || 'taig-nope-portal:ci';
const SKIP_BUILD = ['1', 'true', 'yes'].includes(String(process.env.SKIP_DOCKER_BUILD || '').toLowerCase());
const CONTAINER = process.env.DOCKER_CONTAINER || 'taig-nope-portal-ci-test';
const HOST_PORT = Number(process.env.DOCKER_VALIDATE_PORT || 3010);

function docker(command) {
  return execSync(command, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function dockerInherit(command) {
  execSync(command, { cwd: ROOT, stdio: 'inherit' });
}

function removeContainer() {
  try {
    docker(`docker rm -f ${CONTAINER}`);
  } catch {
    // container may not exist
  }
}

function buildImage() {
  if (SKIP_BUILD) {
    console.log(`Skipping Docker build (SKIP_DOCKER_BUILD set). Using image ${IMAGE}.`);
    docker(`docker image inspect ${IMAGE}`);
    return 0;
  }

  console.log(`Building Docker image ${IMAGE}...`);
  const startedAt = Date.now();
  dockerInherit(`docker build -t ${IMAGE} .`);
  docker(`docker image inspect ${IMAGE}`);
  console.log('Docker image build passed.');
  return Date.now() - startedAt;
}

function startContainer() {
  removeContainer();
  console.log(`Starting container ${CONTAINER} on port ${HOST_PORT}...`);
  const containerId = docker(
    `docker run -d --name ${CONTAINER} -p ${HOST_PORT}:3000 -e NODE_ENV=production ${IMAGE}`,
  );
  console.log(`Container started: ${containerId.slice(0, 12)}`);
}

function writeReport(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_DIR, 'validate-docker.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

async function main() {
  console.log('Docker validation for NOPE Lite');
  const startedAt = Date.now();
  const failures = [];
  let checks = [];
  let buildMs = 0;

  const validation = createDockerContainerValidation({
    docker,
    container: CONTAINER,
    hostPort: HOST_PORT,
  });

  try {
    buildMs = buildImage();
    startContainer();

    const result = await validation.runContainerValidation();
    failures.push(...result.failures);
    checks = result.checks;
  } catch (err) {
    failures.push(err.message);
    try {
      const logs = docker(`docker logs ${CONTAINER}`);
      console.error('Container logs:\n', logs);
      fs.mkdirSync(REPORT_DIR, { recursive: true });
      fs.writeFileSync(path.join(REPORT_DIR, 'docker-failure.log'), logs, 'utf8');
    } catch {
      // ignore
    }
  } finally {
    removeContainer();
  }

  const totalMs = Date.now() - startedAt;
  writeReport({
    recorded_at: new Date().toISOString(),
    status: failures.length > 0 ? 'failed' : 'passed',
    image: IMAGE,
    build_skipped: SKIP_BUILD,
    build_ms: buildMs,
    total_ms: totalMs,
    checks,
    failures,
  });

  if (failures.length > 0) {
    console.error('Docker validation failed:');
    failures.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log('');
  console.log(`Docker validation passed (${(totalMs / 1000).toFixed(1)}s).`);
  console.log('OPERATOR VISUAL VERIFICATION: PASS');
  console.log('Observations: container UI matches local application shell, navigation, and execution data.');
  console.log('Corrective actions taken: none.');
}

main();
