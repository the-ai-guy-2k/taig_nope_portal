'use strict';

const fs = require('fs');
const path = require('path');

const { DATA_FILES } = require('./schemas');
const { loadAll, validateAll } = require('./loader');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

class PersistenceError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'PersistenceError';
    this.errors = errors;
  }
}

function writeDataFile(config, items) {
  const document = { [config.key]: items };
  const filePath = path.join(DATA_DIR, config.path);
  const tempPath = `${filePath}.tmp`;
  const payload = `${JSON.stringify(document, null, 2)}\n`;

  fs.writeFileSync(tempPath, payload, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function saveValidatedState(collections) {
  const errors = validateAll(collections);
  if (errors.length > 0) {
    throw new PersistenceError('Validation failed before save', errors);
  }

  for (const [name, config] of Object.entries(DATA_FILES)) {
    if (name in collections) {
      writeDataFile(config, collections[name]);
    }
  }
}

function saveCollection(collectionName, items) {
  const config = DATA_FILES[collectionName];

  if (!config) {
    throw new PersistenceError(`Unknown collection: ${collectionName}`);
  }

  const collections = loadAll();
  collections[collectionName] = items;
  saveValidatedState(collections);
  return items;
}

function saveJobOrders(jobOrders) {
  return saveCollection('job_orders', jobOrders);
}

function saveTimeline(events) {
  return saveCollection('timeline', events);
}

function readCollection(collectionName) {
  const config = DATA_FILES[collectionName];
  const document = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, config.path), 'utf8'),
  );
  return document[config.key];
}

module.exports = {
  PersistenceError,
  DATA_DIR,
  writeDataFile,
  saveValidatedState,
  saveCollection,
  saveJobOrders,
  saveTimeline,
  readCollection,
};
