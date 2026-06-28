#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { DATA_FILES } = require('../src/models/schemas');
const { loadAndValidate, getJobOrderById } = require('../src/models/loader');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const REQUIRED_DATA_FILES = Object.values(DATA_FILES).map((config) => config.path);

function validateJsonSyntax() {
  const errors = [];

  for (const filename of REQUIRED_DATA_FILES) {
    const filePath = path.join(DATA_DIR, filename);
    const raw = fs.readFileSync(filePath, 'utf8');

    try {
      JSON.parse(raw);
    } catch (err) {
      errors.push(`${filename}: invalid JSON — ${err.message}`);
    }
  }

  return errors;
}

function main() {
  const errors = [];

  for (const filename of REQUIRED_DATA_FILES) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing data file: data/${filename}`);
    }
  }

  if (errors.length > 0) {
    console.error('Data file validation failed:');
    errors.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  errors.push(...validateJsonSyntax());

  if (errors.length > 0) {
    console.error('JSON syntax validation failed:');
    errors.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log(`JSON syntax validation passed (${REQUIRED_DATA_FILES.length} files).`);

  try {
    const collections = loadAndValidate();
    const seedJobOrder = getJobOrderById('jo-aci-002-seed', collections);

    if (!seedJobOrder) {
      throw new Error('Seed Job Order "jo-aci-002-seed" not found');
    }

    console.log('Data model validation passed.');
    console.log(`  Job orders: ${collections.job_orders.length}`);
    console.log(`  Seed Job Order: ${seedJobOrder.id} — ${seedJobOrder.title}`);
    console.log(`  Operator actions: ${collections.operator_actions.length}`);
    console.log(`  Minority reports: ${collections.minority_reports.length}`);
    console.log(`  Timeline events: ${collections.timeline.length}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
