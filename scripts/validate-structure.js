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
  'data',
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
