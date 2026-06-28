'use strict';

const { randomUUID } = require('crypto');
const { getJobOrderById, loadAll, loadAndValidate, validateAll } = require('../models/loader');
const { saveValidatedState, PersistenceError } = require('../models/writer');
const {
  JOB_ORDER_STATUSES,
  RISK_SEVERITIES,
  RISK_STATUSES,
} = require('../models/schemas');

const ID_PATTERN = /^jo-[a-z0-9-]+$/;

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
}

function parseCriteria(value) {
  if (!value || !String(value).trim()) {
    return [];
  }

  return String(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parsePassdown(body) {
  const summary = String(body.passdown_summary || '').trim();

  if (!summary) {
    return null;
  }

  const nextSteps = parseCriteria(body.passdown_next_steps);
  const handedOffBy = String(body.passdown_handed_off_by || '').trim();

  return {
    summary,
    handed_off_at: nowIso(),
    ...(nextSteps.length ? { next_steps: nextSteps } : {}),
    ...(handedOffBy ? { handed_off_by: handedOffBy } : {}),
  };
}

function parseRisks(body, existingRisks = []) {
  const existingById = new Map(existingRisks.map((risk) => [risk.id, risk]));
  const risks = [];
  const entries = Array.isArray(body.risks) ? body.risks : [];

  entries.forEach((entry, index) => {
    const description = String(entry?.description || '').trim();
    if (!description) {
      return;
    }

    const severity = String(entry?.severity || 'low').trim();
    const status = String(entry?.status || 'open').trim();
    const existingId = String(entry?.id || '').trim();

    if (!RISK_SEVERITIES.includes(severity)) {
      throw new PersistenceError(`Risk ${index + 1}: invalid severity "${severity}"`);
    }

    if (!RISK_STATUSES.includes(status)) {
      throw new PersistenceError(`Risk ${index + 1}: invalid status "${status}"`);
    }

    const existing = existingId ? existingById.get(existingId) : null;
    risks.push({
      id: existing?.id || `risk-${randomUUID().slice(0, 8)}`,
      description,
      severity,
      status,
      created_at: existing?.created_at || nowIso(),
    });
  });

  return risks;
}

function buildJobOrderFromForm(body, existing = null) {
  const errors = [];
  const id = normalizeId(body.id || existing?.id);
  const title = String(body.title || '').trim();
  const mission = String(body.mission || '').trim();
  const status = String(body.status || '').trim();

  if (!existing && !id) {
    errors.push('Job Order ID is required');
  }

  if (!existing && id && !ID_PATTERN.test(id)) {
    errors.push('Job Order ID must match pattern jo-[a-z0-9-]+');
  }

  if (!title) {
    errors.push('Title is required');
  }

  if (!mission) {
    errors.push('Mission is required');
  }

  if (!status || !JOB_ORDER_STATUSES.includes(status)) {
    errors.push(`Status must be one of: ${JOB_ORDER_STATUSES.join(', ')}`);
  }

  const currentStatement = String(body.current_truth_statement || '').trim();
  const nextStatement = String(body.next_truth_statement || '').trim();
  const targetStatement = String(body.target_truth_statement || '').trim();
  const humanSummary = String(body.human_summary || '').trim();

  if (!currentStatement) {
    errors.push('Current Truth statement is required');
  }

  if (!nextStatement) {
    errors.push('Next Truth statement is required');
  }

  if (!targetStatement) {
    errors.push('Target Truth statement is required');
  }

  if (!humanSummary) {
    errors.push('Human Summary is required');
  }

  if (errors.length > 0) {
    throw new PersistenceError('Job Order form validation failed', errors);
  }

  const timestamp = nowIso();

  let risks;
  try {
    risks = parseRisks(body, existing?.risks || []);
  } catch (err) {
    if (err instanceof PersistenceError) {
      throw err;
    }
    throw new PersistenceError(err.message);
  }

  const jobOrder = {
    id,
    title,
    mission,
    status,
    current_truth: {
      statement: currentStatement,
      recorded_at: timestamp,
      ...(String(body.current_truth_source || '').trim()
        ? { source: String(body.current_truth_source).trim() }
        : {}),
      ...(String(body.current_truth_recorded_by || '').trim()
        ? { recorded_by: String(body.current_truth_recorded_by).trim() }
        : {}),
    },
    next_truth: {
      statement: nextStatement,
      recorded_at: timestamp,
      ...(String(body.next_truth_rationale || '').trim()
        ? { rationale: String(body.next_truth_rationale).trim() }
        : {}),
    },
    target_truth: {
      statement: targetStatement,
      recorded_at: timestamp,
      criteria: parseCriteria(body.target_truth_criteria),
    },
    human_summary: {
      summary: humanSummary,
      updated_at: timestamp,
      ...(String(body.human_summary_author || '').trim()
        ? { author: String(body.human_summary_author).trim() }
        : {}),
    },
    minority_report_current: existing?.minority_report_current ?? null,
    minority_report_previous: existing?.minority_report_previous ?? null,
    aep: existing?.aep ?? '',
    acis: existing?.acis ?? [],
    operator_actions: existing?.operator_actions ?? [],
    completion_reports: existing?.completion_reports ?? [],
    timeline: existing?.timeline ?? [],
    risks,
    artifacts: existing?.artifacts ?? [],
    passdown: parsePassdown(body),
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  };

  return jobOrder;
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

function persistJobOrderAndTimeline(jobOrders, timeline) {
  const collections = loadAll();
  collections.job_orders = jobOrders;
  collections.timeline = timeline;
  saveValidatedState(collections);
}

function createJobOrder(body) {
  const collections = loadAndValidate();
  const jobOrder = buildJobOrderFromForm(body);

  if (collections.job_orders.some((item) => item.id === jobOrder.id)) {
    throw new PersistenceError('Job Order ID already exists', [`Duplicate id "${jobOrder.id}"`]);
  }

  const timelineEvent = createTimelineEvent(
    jobOrder.id,
    'job_order_created',
    `Job Order "${jobOrder.title}" created.`,
  );

  jobOrder.timeline = [timelineEvent.id];
  const jobOrders = [...collections.job_orders, jobOrder];
  const timeline = [...collections.timeline, timelineEvent];
  persistJobOrderAndTimeline(jobOrders, timeline);

  return getJobOrderById(jobOrder.id, loadAndValidate());
}

function updateJobOrder(id, body) {
  const collections = loadAndValidate();
  const existing = getJobOrderById(id, collections);

  if (!existing) {
    throw new PersistenceError(`Job Order "${id}" not found`);
  }

  const jobOrder = buildJobOrderFromForm({ ...body, id }, existing);
  const timelineEvent = createTimelineEvent(
    jobOrder.id,
    'job_order_updated',
    `Job Order "${jobOrder.title}" updated.`,
  );

  jobOrder.timeline = [...existing.timeline, timelineEvent.id];

  const jobOrders = collections.job_orders.map((item) => (
    item.id === id ? jobOrder : item
  ));
  const timeline = [...collections.timeline, timelineEvent];
  persistJobOrderAndTimeline(jobOrders, timeline);

  return getJobOrderById(id, loadAndValidate());
}

function deleteJobOrder(id) {
  const collections = loadAndValidate();
  const existing = getJobOrderById(id, collections);

  if (!existing) {
    return false;
  }

  const jobOrders = collections.job_orders.filter((item) => item.id !== id);
  const timeline = collections.timeline.filter((event) => event.job_order_id !== id);
  persistJobOrderAndTimeline(jobOrders, timeline);
  return true;
}

function formDefaults(existing = null) {
  if (!existing) {
    return {
      id: '',
      title: '',
      mission: '',
      status: 'draft',
      current_truth_statement: '',
      current_truth_source: '',
      current_truth_recorded_by: 'operator',
      next_truth_statement: '',
      next_truth_rationale: '',
      target_truth_statement: '',
      target_truth_criteria: '',
      human_summary: '',
      human_summary_author: 'operator',
      passdown_summary: '',
      passdown_next_steps: '',
      passdown_handed_off_by: '',
      risks: [{ description: '', severity: 'low', status: 'open', id: '' }],
    };
  }

  return {
    id: existing.id,
    title: existing.title,
    mission: existing.mission,
    status: existing.status,
    current_truth_statement: existing.current_truth.statement,
    current_truth_source: existing.current_truth.source || '',
    current_truth_recorded_by: existing.current_truth.recorded_by || '',
    next_truth_statement: existing.next_truth.statement,
    next_truth_rationale: existing.next_truth.rationale || '',
    target_truth_statement: existing.target_truth.statement,
    target_truth_criteria: (existing.target_truth.criteria || []).join('\n'),
    human_summary: existing.human_summary.summary,
    human_summary_author: existing.human_summary.author || '',
    passdown_summary: existing.passdown?.summary || '',
    passdown_next_steps: (existing.passdown?.next_steps || []).join('\n'),
    passdown_handed_off_by: existing.passdown?.handed_off_by || '',
    risks: existing.risks.length
      ? existing.risks.map((risk) => ({
        id: risk.id,
        description: risk.description,
        severity: risk.severity,
        status: risk.status,
      }))
      : [{ description: '', severity: 'low', status: 'open', id: '' }],
  };
}

module.exports = {
  PersistenceError,
  ID_PATTERN,
  buildJobOrderFromForm,
  createJobOrder,
  updateJobOrder,
  deleteJobOrder,
  formDefaults,
  JOB_ORDER_STATUSES,
  RISK_SEVERITIES,
  RISK_STATUSES,
};
