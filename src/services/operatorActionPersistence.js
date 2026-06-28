'use strict';

const { randomUUID } = require('crypto');
const { getJobOrderById } = require('../models/loader');
const { OPERATOR_ACTION_STATUSES } = require('../models/schemas');
const {
  PersistenceError,
  nowIso,
  loadCollections,
  persistCollections,
  appendTimeline,
  updateJobOrderTimelineRef,
} = require('./operationalHelpers');

function parseChecklist(body) {
  const entries = Array.isArray(body.checklist) ? body.checklist : [];
  return entries
    .map((item) => ({
      text: String(item?.text || '').trim(),
      completed: item?.completed === 'on' || item?.completed === true || item?.completed === 'true',
    }))
    .filter((item) => item.text);
}

function buildOperatorActionFromForm(body, jobOrderId, existing = null) {
  const errors = [];
  const action = String(body.action || '').trim();
  const operator = String(body.operator || 'operator').trim();
  const status = String(body.status || existing?.status || 'open').trim();
  const notes = String(body.notes || '').trim();

  if (!action) {
    errors.push('Action description is required');
  }

  if (!OPERATOR_ACTION_STATUSES.includes(status)) {
    errors.push(`Status must be one of: ${OPERATOR_ACTION_STATUSES.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new PersistenceError('Operator Action validation failed', errors);
  }

  const timestamp = nowIso();
  const checklist = parseChecklist(body);
  const completedAt = status === 'completed'
    ? (existing?.completed_at || timestamp)
    : (existing?.completed_at && status !== 'open' ? existing.completed_at : null);

  return {
    id: existing?.id || `oa-${randomUUID().slice(0, 8)}`,
    job_order_id: jobOrderId,
    action,
    operator,
    status,
    notes: notes || undefined,
    checklist,
    created_at: existing?.created_at || timestamp,
    completed_at: completedAt,
  };
}

function listOperatorActionsForJobOrder(jobOrderId) {
  const collections = loadCollections();
  return collections.operator_actions
    .filter((item) => item.job_order_id === jobOrderId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

function getOperatorAction(jobOrderId, actionId) {
  return listOperatorActionsForJobOrder(jobOrderId).find((item) => item.id === actionId) || null;
}

function createOperatorAction(jobOrderId, body) {
  const collections = loadCollections();
  const jobOrder = getJobOrderById(jobOrderId, collections);

  if (!jobOrder) {
    throw new PersistenceError(`Job Order "${jobOrderId}" not found`);
  }

  const operatorAction = buildOperatorActionFromForm(body, jobOrderId);
  collections.operator_actions.push(operatorAction);

  const updatedJobOrders = collections.job_orders.map((item) => {
    if (item.id !== jobOrderId) {
      return item;
    }
    return {
      ...item,
      operator_actions: [...item.operator_actions, operatorAction.id],
      updated_at: nowIso(),
    };
  });
  collections.job_orders = updatedJobOrders;

  const event = appendTimeline(
    collections,
    jobOrderId,
    'operator_action_created',
    `Operator action created: ${operatorAction.action}`,
    operatorAction.operator,
  );
  updateJobOrderTimelineRef(collections, jobOrderId, event.id);

  persistCollections(collections);
  return operatorAction;
}

function updateOperatorAction(jobOrderId, actionId, body) {
  const collections = loadCollections();
  const existing = collections.operator_actions.find((item) => item.id === actionId);

  if (!existing || existing.job_order_id !== jobOrderId) {
    throw new PersistenceError(`Operator Action "${actionId}" not found`);
  }

  const operatorAction = buildOperatorActionFromForm(body, jobOrderId, existing);
  collections.operator_actions = collections.operator_actions.map((item) => (
    item.id === actionId ? operatorAction : item
  ));

  const event = appendTimeline(
    collections,
    jobOrderId,
    'operator_action_updated',
    `Operator action updated: ${operatorAction.action}`,
    operatorAction.operator,
  );
  updateJobOrderTimelineRef(collections, jobOrderId, event.id);

  persistCollections(collections);
  return operatorAction;
}

function completeOperatorAction(jobOrderId, actionId) {
  const existing = getOperatorAction(jobOrderId, actionId);
  if (!existing) {
    throw new PersistenceError(`Operator Action "${actionId}" not found`);
  }

  return updateOperatorAction(jobOrderId, actionId, {
    action: existing.action,
    operator: existing.operator,
    status: 'completed',
    notes: existing.notes || '',
    checklist: (existing.checklist || []).map((item) => ({
      text: item.text,
      completed: true,
    })),
  });
}

function archiveOperatorAction(jobOrderId, actionId) {
  const existing = getOperatorAction(jobOrderId, actionId);
  if (!existing) {
    throw new PersistenceError(`Operator Action "${actionId}" not found`);
  }

  return updateOperatorAction(jobOrderId, actionId, {
    action: existing.action,
    operator: existing.operator,
    status: 'archived',
    notes: existing.notes || '',
    checklist: existing.checklist || [],
  });
}

function formDefaults(existing = null) {
  if (!existing) {
    return {
      action: '',
      operator: 'operator',
      status: 'open',
      notes: '',
      checklist: [{ text: '', completed: false }],
    };
  }

  return {
    action: existing.action,
    operator: existing.operator,
    status: existing.status,
    notes: existing.notes || '',
    checklist: (existing.checklist && existing.checklist.length)
      ? existing.checklist
      : [{ text: '', completed: false }],
  };
}

module.exports = {
  PersistenceError,
  OPERATOR_ACTION_STATUSES,
  listOperatorActionsForJobOrder,
  getOperatorAction,
  createOperatorAction,
  updateOperatorAction,
  completeOperatorAction,
  archiveOperatorAction,
  formDefaults,
};
