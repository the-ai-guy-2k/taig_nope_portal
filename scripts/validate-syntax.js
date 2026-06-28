#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function collectJsFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const targets = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'scripts'),
];

const jsFiles = targets.flatMap((target) => collectJsFiles(target));
const failures = [];

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push({
      file: path.relative(ROOT, file),
      error: (result.stderr || result.stdout || 'Syntax check failed').trim(),
    });
  }
}

if (failures.length > 0) {
  console.error('Syntax validation failed:');
  failures.forEach(({ file, error }) => {
    console.error(`  - ${file}: ${error}`);
  });
  process.exit(1);
}

console.log(`Syntax validation passed (${jsFiles.length} files).`);
