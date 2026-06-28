#!/usr/bin/env node
'use strict';

/**
 * Records Docker Hub publish metadata after a successful push.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPORT_DIR = process.env.CI_REPORT_DIR || path.join(__dirname, '..', 'ci-reports');
const IMAGE = process.env.DOCKER_HUB_IMAGE;
const SHA = process.env.GITHUB_SHA || 'local';

function inspectTag(tag) {
  const ref = `${IMAGE}:${tag}`;
  const raw = execSync(`docker buildx imagetools inspect ${ref} --format '{{json .}}'`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const data = JSON.parse(raw);
  const digest = data.manifest?.digest || data.Digest || null;
  const size = data.manifest?.size || null;
  return { tag, ref, digest, compressed_size_bytes: size };
}

function main() {
  if (!IMAGE) {
    console.error('DOCKER_HUB_IMAGE is required.');
    process.exit(1);
  }

  const tags = ['latest', 'deployable', SHA];
  const published = tags.map((tag) => {
    try {
      return inspectTag(tag);
    } catch (err) {
      return { tag, ref: `${IMAGE}:${tag}`, error: err.message };
    }
  });

  const failures = published.filter((entry) => entry.error || !entry.digest);
  if (failures.length > 0) {
    console.error('Docker Hub publish verification failed:');
    failures.forEach((entry) => console.error(`  - ${entry.ref}: ${entry.error || 'missing digest'}`));
    process.exit(1);
  }

  const report = {
    recorded_at: new Date().toISOString(),
    status: 'published',
    image_name: IMAGE,
    tags: published,
    commit_sha: SHA,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_DIR, 'docker-publish.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  console.log('Docker Hub publish verified:');
  published.forEach((entry) => {
    console.log(`  ${entry.ref} → ${entry.digest}`);
  });
}

main();
