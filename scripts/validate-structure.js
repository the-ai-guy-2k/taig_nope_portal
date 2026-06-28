#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const REQUIRED_PATHS = [
  'README.md',
  '.gitignore',
  '.dockerignore',
  'package.json',
  'package-lock.json',
  'Dockerfile',
  'src/server.js',
  'src/app.js',
  'src/routes/index.js',
  'src/services/jobOrderService.js',
  'src/services/jobOrderPersistence.js',
  'src/services/operatorActionPersistence.js',
  'src/services/minorityReportPersistence.js',
  'src/services/operationalHelpers.js',
  'src/services/localPreservation.js',
  'views/job-orders/operator-actions.ejs',
  'views/job-orders/minority-report-form.ejs',
  'src/models/writer.js',
  'views/job-orders/form.ejs',
  'views/dashboard/workspace.ejs',
  'public/css/dashboard.css',
  'data/job_orders.json',
  'data/aci_history.json',
  'data/minority_reports.json',
  'data/operator_actions.json',
  'data/completion_reports.json',
  'data/timeline.json',
  'src/models/index.js',
  'docs/aci_history/README.md',
  'docs/BRANCH_PROTECTION.md',
  'docs/DOCKER_HUB.md',
  'docs/OPERATOR_RUNBOOK.md',
  'docs/DEVELOPER_RUNBOOK.md',
  'docs/VALIDATION_GUIDE.md',
  'docs/PA_RISK_REGISTER.md',
  'docs/reports',
  'docs/reports/PA_validation_report.md',
  'docs/reports/ACI-011-completion-report.md',
  '.github/workflows/ci.yml',
  'scripts/validate-preservation.js',
  'scripts/validate-operator-visual.js',
  'scripts/smoke-tests.js',
  'scripts/validate-all.js',
  'scripts/validate-docker.js',
  'scripts/ci-metadata.js',
  'scripts/ci-pipeline-summary.js',
  'scripts/ci-pipeline-performance.js',
  'scripts/ci-docker-publish.js',
  'scripts/validate-docker-pull.js',
  'scripts/lib/docker-container-validation.js',
  'scripts/lib/test-server.js',
];

const missing = REQUIRED_PATHS.filter((relativePath) => {
  const fullPath = path.join(ROOT, relativePath);
  return !fs.existsSync(fullPath);
});

if (missing.length > 0) {
  console.error('Repository structure validation failed. Missing:');
  missing.forEach((item) => console.error(`  - ${item}`));
  process.exit(1);
}

console.log('Repository structure validation passed.');
