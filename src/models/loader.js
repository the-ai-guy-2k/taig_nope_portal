'use strict';

const fs = require('fs');
const path = require('path');

const { DATA_FILES } = require('./schemas');
const {
  validateCollection,
  validateUniqueIds,
  validateJobOrderReferences,
} = require('./validator');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function readJsonFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf8');

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${filename}: ${err.message}`);
  }
}

function loadDataFile(config) {
  const document = readJsonFile(config.path);
  const items = document[config.key];

  if (!Array.isArray(items)) {
    throw new Error(`${config.path}: "${config.key}" must be an array`);
  }

  return items;
}

function loadAll() {
  const collections = {};

  for (const [name, config] of Object.entries(DATA_FILES)) {
    collections[name] = loadDataFile(config);
  }

  return collections;
}

function validateAll(collections = loadAll()) {
  const errors = [];

  for (const [name, config] of Object.entries(DATA_FILES)) {
    const items = collections[name];
    errors.push(...validateCollection(items, config.itemSchema, config.key));
    errors.push(...validateUniqueIds(items, config.idField, config.key));
  }

  const jobOrderIds = new Set();
  for (const jobOrder of collections.job_orders) {
    if (jobOrderIds.has(jobOrder.id)) {
      errors.push(`Duplicate Job Order id "${jobOrder.id}"`);
    }
    jobOrderIds.add(jobOrder.id);
    errors.push(...validateJobOrderReferences(jobOrder, collections));
  }

  return errors;
}

function loadAndValidate() {
  const collections = loadAll();
  const errors = validateAll(collections);

  if (errors.length > 0) {
    const message = errors.join('\n');
    throw new Error(`Data validation failed:\n${message}`);
  }

  return collections;
}

function getJobOrderById(id, collections = loadAll()) {
  return collections.job_orders.find((jo) => jo.id === id) || null;
}

module.exports = {
  DATA_DIR,
  loadAll,
  validateAll,
  loadAndValidate,
  getJobOrderById,
  readJsonFile,
};
