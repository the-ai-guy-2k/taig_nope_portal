#!/usr/bin/env node
'use strict';

/**
 * Aggregates CI job reports into a GitHub Actions workflow summary.
 */

const fs = require('fs');
const path = require('path');

const REPORT_DIR = process.env.CI_REPORT_DIR || path.join(__dirname, '..', 'ci-reports');
const SUMMARY_FILE = process.env.GITHUB_STEP_SUMMARY;

function readJson(name) {
  const direct = path.join(REPORT_DIR, name);
  if (fs.existsSync(direct)) {
    return JSON.parse(fs.readFileSync(direct, 'utf8'));
  }

  function walk(dir) {
    if (!fs.existsSync(dir)) {
      return null;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === name) {
        return JSON.parse(fs.readFileSync(full, 'utf8'));
      }
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  return walk(REPORT_DIR);
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function main() {
  const metadata = readJson('build-metadata.json');
  const validate = readJson('validate-all.json');
  const docker = readJson('validate-docker.json');
  const pipeline = readJson('pipeline-performance.json');

  const lines = [
    '# NOPE Lite — CI/CD Pipeline Summary',
    '',
    '## Build Metadata',
    '',
  ];

  if (metadata) {
    lines.push(
      `| Field | Value |`,
      `|-------|-------|`,
      `| SHA | \`${String(metadata.sha).slice(0, 7)}\` |`,
      `| Ref | \`${metadata.ref}\` |`,
      `| Run | ${metadata.run_id} (attempt ${metadata.run_attempt}) |`,
      `| Actor | ${metadata.actor} |`,
      `| Recorded | ${metadata.recorded_at} |`,
      '',
    );
  }

  lines.push('## Validation Results', '');

  if (validate) {
    lines.push(
      `**Validation + Smoke Tests:** ${validate.status}`,
      '',
      `Total: ${formatSeconds(validate.total_ms)}`,
      '',
      '| Stage | Duration | Status |',
      '|-------|----------|--------|',
    );
    for (const stage of validate.stages || []) {
      lines.push(`| ${stage.label} | ${formatSeconds(stage.duration_ms)} | ${stage.status} |`);
    }
    lines.push('');
  } else {
    lines.push('_Validation report not found._', '');
  }

  if (docker) {
    lines.push(
      `**Docker Foundation Validation:** ${docker.status}`,
      '',
      `Total: ${formatSeconds(docker.total_ms)}`,
      `Image: \`${docker.image || 'n/a'}\``,
      `Build skipped: ${docker.build_skipped ? 'yes (CI cache)' : 'no'}`,
      '',
    );
    if (docker.checks?.length) {
      lines.push('| Check | Duration | Status |', '|-------|----------|--------|');
      for (const check of docker.checks) {
        lines.push(`| ${check.name} | ${formatSeconds(check.duration_ms)} | ${check.status} |`);
      }
      lines.push('');
    }
  } else {
    lines.push('_Docker validation report not found._', '');
  }

  if (pipeline) {
    lines.push(
      '## Pipeline Performance',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total execution time | ${formatSeconds(pipeline.total_ms)} |`,
      `| Longest job | ${pipeline.longest_job} (${formatSeconds(pipeline.longest_job_ms)}) |`,
      `| Fastest job | ${pipeline.fastest_job} (${formatSeconds(pipeline.fastest_job_ms)}) |`,
      `| Failed retry count | ${pipeline.failed_retry_count} |`,
      '',
      `**Reliability:** ${pipeline.reliability_note}`,
      '',
    );
  }

  lines.push(
    '## Gates',
    '',
    '- Structure, syntax, data, workflow, operational, preservation',
    '- Routes, smoke tests, operator visual verification',
    '- Docker build, runtime, preservation, container smoke',
    '',
  );

  const output = lines.join('\n');
  console.log(output);

  if (SUMMARY_FILE) {
    fs.appendFileSync(SUMMARY_FILE, `${output}\n`, 'utf8');
  }
}

main();
