'use strict';

const { randomUUID } = require('crypto');
const { loadAll } = require('../models/loader');
const { saveValidatedState } = require('../models/writer');

class PersistenceError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'PersistenceError';
    this.errors = errors;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function createTimelineEvent(jobOrderId, eventType, description, actor = 'operator') {
  return {
    id: `te-${randomUUID().slice(0, 8)}`,
    job_order_id: jobOrderId,
    event_type: eventType,
    description,
    actor,
    created_at: nowIso(),
  };
}

function persistCollections(collections) {
  saveValidatedState(collections);
}

function loadCollections() {
  return loadAll();
}

function appendTimeline(collections, jobOrderId, eventType, description, actor = 'operator') {
  const event = createTimelineEvent(jobOrderId, eventType, description, actor);
  collections.timeline.push(event);
  return event;
}

function updateJobOrderTimelineRef(collections, jobOrderId, eventId) {
  const jobOrder = collections.job_orders.find((item) => item.id === jobOrderId);
  if (jobOrder) {
    jobOrder.timeline = [...jobOrder.timeline, eventId];
    jobOrder.updated_at = nowIso();
  }
  return jobOrder;
}

module.exports = {
  PersistenceError,
  nowIso,
  createTimelineEvent,
  persistCollections,
  loadCollections,
  appendTimeline,
  updateJobOrderTimelineRef,
};
