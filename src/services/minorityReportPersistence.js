'use strict';

const { randomUUID } = require('crypto');
const { getJobOrderById } = require('../models/loader');
const { MINORITY_REPORT_STATUSES } = require('../models/schemas');
const {
  PersistenceError,
  nowIso,
  loadCollections,
  persistCollections,
  appendTimeline,
  updateJobOrderTimelineRef,
} = require('./operationalHelpers');

function buildMinorityReportFromForm(body, jobOrderId) {
  const errors = [];
  const fields = {
    title: String(body.title || '').trim(),
    mission: String(body.mission || '').trim(),
    current_phase: String(body.current_phase || '').trim(),
    human_summary: String(body.human_summary || '').trim(),
    current_truth: String(body.current_truth || '').trim(),
    completed: String(body.completed || '').trim(),
    remaining: String(body.remaining || '').trim(),
    risk: String(body.risk || '').trim(),
    next_truth: String(body.next_truth || '').trim(),
    next_action: String(body.next_action || '').trim(),
    target: String(body.target || '').trim(),
  };

  for (const [key, value] of Object.entries(fields)) {
    if (!value) {
      errors.push(`${key.replace(/_/g, ' ')} is required`);
    }
  }

  if (errors.length > 0) {
    throw new PersistenceError('Minority Report validation failed', errors);
  }

  const timestamp = nowIso();

  return {
    id: `mr-${randomUUID().slice(0, 8)}`,
    job_order_id: jobOrderId,
    title: fields.title,
    status: 'open',
    mission: fields.mission,
    current_phase: fields.current_phase,
    human_summary: fields.human_summary,
    current_truth: fields.current_truth,
    completed: fields.completed,
    remaining: fields.remaining,
    risk: fields.risk,
    next_truth: fields.next_truth,
    next_action: fields.next_action,
    target: fields.target,
    content: fields.human_summary,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function getMinorityReportById(reportId, collections = loadCollections()) {
  return collections.minority_reports.find((item) => item.id === reportId) || null;
}

function formDefaults(jobOrder = null, currentReport = null) {
  if (currentReport) {
    return {
      title: currentReport.title,
      mission: currentReport.mission,
      current_phase: currentReport.current_phase,
      human_summary: currentReport.human_summary,
      current_truth: currentReport.current_truth,
      completed: currentReport.completed,
      remaining: currentReport.remaining,
      risk: currentReport.risk,
      next_truth: currentReport.next_truth,
      next_action: currentReport.next_action,
      target: currentReport.target,
    };
  }

  return {
    title: '',
    mission: jobOrder?.mission || '',
    current_phase: '',
    human_summary: jobOrder?.human_summary?.summary || '',
    current_truth: jobOrder?.current_truth?.statement || '',
    completed: '',
    remaining: '',
    risk: '',
    next_truth: jobOrder?.next_truth?.statement || '',
    next_action: '',
    target: jobOrder?.target_truth?.statement || '',
  };
}

function saveMinorityReport(jobOrderId, body) {
  const collections = loadCollections();
  const jobOrder = getJobOrderById(jobOrderId, collections);

  if (!jobOrder) {
    throw new PersistenceError(`Job Order "${jobOrderId}" not found`);
  }

  const newReport = buildMinorityReportFromForm(body, jobOrderId);
  const reports = [...collections.minority_reports];

  if (jobOrder.minority_report_current) {
    const currentIndex = reports.findIndex((item) => item.id === jobOrder.minority_report_current);
    if (currentIndex >= 0) {
      reports[currentIndex] = {
        ...reports[currentIndex],
        status: 'superseded',
        updated_at: nowIso(),
      };
    }
  }

  if (jobOrder.minority_report_previous) {
    const previousIndex = reports.findIndex((item) => item.id === jobOrder.minority_report_previous);
    if (previousIndex >= 0) {
      reports[previousIndex] = {
        ...reports[previousIndex],
        status: 'archived',
        updated_at: nowIso(),
      };
    }
  }

  reports.push(newReport);
  collections.minority_reports = reports;

  collections.job_orders = collections.job_orders.map((item) => {
    if (item.id !== jobOrderId) {
      return item;
    }

    return {
      ...item,
      minority_report_previous: jobOrder.minority_report_current || item.minority_report_previous,
      minority_report_current: newReport.id,
      updated_at: nowIso(),
    };
  });

  const event = appendTimeline(
    collections,
    jobOrderId,
    'minority_report_saved',
    `Minority report saved: ${newReport.title}`,
  );
  updateJobOrderTimelineRef(collections, jobOrderId, event.id);

  persistCollections(collections);
  return newReport;
}

module.exports = {
  PersistenceError,
  MINORITY_REPORT_STATUSES,
  buildMinorityReportFromForm,
  getMinorityReportById,
  formDefaults,
  saveMinorityReport,
};
