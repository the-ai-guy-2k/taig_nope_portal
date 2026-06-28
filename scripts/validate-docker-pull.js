#!/usr/bin/env node
'use strict';

/**
 * Pull published image from Docker Hub and validate runtime + operator experience.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createDockerContainerValidation } = require('./lib/docker-container-validation');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = process.env.CI_REPORT_DIR || path.join(ROOT, 'ci-reports');
const IMAGE = process.env.DOCKER_HUB_IMAGE;
const PULL_TAG = process.env.DOCKER_PULL_TAG || 'deployable';
const CONTAINER = process.env.DOCKER_CONTAINER || 'taig-nope-portal-pull-test';
const HOST_PORT = Number(process.env.DOCKER_VALIDATE_PORT || 3011);

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
    // ignore
  }
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) {
    return 'unknown';
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB (${bytes} bytes)`;
}

async function main() {
  if (!IMAGE) {
    console.error('DOCKER_HUB_IMAGE is required.');
    process.exit(1);
  }

  const imageRef = `${IMAGE}:${PULL_TAG}`;
  console.log(`Docker Hub pull validation for ${imageRef}`);

  const startedAt = Date.now();
  const failures = [];
  let checks = [];
  let pullMs = 0;
  let startupMs = 0;
  let imageMeta = {};

  try {
    removeContainer();

    const pullStart = Date.now();
    console.log(`Pulling ${imageRef}...`);
    dockerInherit(`docker pull ${imageRef}`);
    pullMs = Date.now() - pullStart;
    console.log(`Pull completed in ${(pullMs / 1000).toFixed(1)}s`);

    const inspectRaw = docker(`docker image inspect ${imageRef} --format '{{json .}}'`);
    const inspect = JSON.parse(inspectRaw);
    const repoDigest = inspect.RepoDigests?.[0] || null;
    const digest = repoDigest ? repoDigest.split('@')[1] : null;

    imageMeta = {
      image_name: IMAGE,
      image_ref: imageRef,
      pull_tag: PULL_TAG,
      digest,
      repo_digest: repoDigest,
      uncompressed_size_bytes: inspect.Size || null,
      compressed_size_note: 'Registry compressed size recorded from publish manifest when available',
    };

    const startupStart = Date.now();
    const containerId = docker(
      `docker run -d --name ${CONTAINER} -p ${HOST_PORT}:3000 -e NODE_ENV=production ${imageRef}`,
    );
    console.log(`Container started: ${containerId.slice(0, 12)}`);

    const validation = createDockerContainerValidation({
      docker,
      container: CONTAINER,
      hostPort: HOST_PORT,
    });

    const result = await validation.runContainerValidation();
    startupMs = Date.now() - startupStart;
    failures.push(...result.failures);
    checks = result.checks;
  } catch (err) {
    failures.push(err.message);
    try {
      const logs = docker(`docker logs ${CONTAINER}`);
      console.error('Container logs:\n', logs);
      fs.mkdirSync(REPORT_DIR, { recursive: true });
      fs.writeFileSync(path.join(REPORT_DIR, 'docker-pull-failure.log'), logs, 'utf8');
    } catch {
      // ignore
    }
  } finally {
    removeContainer();
  }

  const totalMs = Date.now() - startedAt;

  let publishMeta = null;
  const publishPath = path.join(REPORT_DIR, 'docker-publish.json');
  if (fs.existsSync(publishPath)) {
    publishMeta = JSON.parse(fs.readFileSync(publishPath, 'utf8'));
    const tagEntry = publishMeta.tags?.find((t) => t.tag === PULL_TAG);
    if (tagEntry?.compressed_size_bytes) {
      imageMeta.compressed_size_bytes = tagEntry.compressed_size_bytes;
    }
  }

  const artifactReport = {
    recorded_at: new Date().toISOString(),
    status: failures.length > 0 ? 'failed' : 'passed',
    ...imageMeta,
    compressed_size_display: formatBytes(imageMeta.compressed_size_bytes || imageMeta.uncompressed_size_bytes),
    pull_duration_ms: pullMs,
    container_startup_ms: startupMs,
    total_ms: totalMs,
    docker_pull_validation: failures.length === 0 ? 'PASS' : 'FAIL',
    operator_visual_verification: failures.length === 0 ? 'PASS' : 'FAIL',
    checks,
    failures,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_DIR, 'docker-artifact.json'),
    `${JSON.stringify(artifactReport, null, 2)}\n`,
    'utf8',
  );

  fs.writeFileSync(
    path.join(REPORT_DIR, 'validate-docker-pull.json'),
    `${JSON.stringify(artifactReport, null, 2)}\n`,
    'utf8',
  );

  if (failures.length > 0) {
    console.error('Docker Hub pull validation failed:');
    failures.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log('');
  console.log('Docker Hub pull validation passed.');
  console.log(`  Image: ${imageRef}`);
  console.log(`  Digest: ${imageMeta.digest || 'n/a'}`);
  console.log(`  Size: ${artifactReport.compressed_size_display}`);
  console.log(`  Pull: ${(pullMs / 1000).toFixed(1)}s | Startup+validation: ${(startupMs / 1000).toFixed(1)}s`);
  console.log('OPERATOR VISUAL VERIFICATION: PASS');
}

main();
