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
  'views/index.ejs',
  'public/css/main.css',
  'public/js/main.js',
  'data/job_orders.json',
  'data/aci_history.json',
  'data/minority_reports.json',
  'data/operator_actions.json',
  'data/completion_reports.json',
  'data/timeline.json',
  'src/models/index.js',
  'docs/aci_history/README.md',
  'docs/reports',
  'scripts',
  '.github/workflows',
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
