'use strict';

const { loadAndValidate, getJobOrderById } = require('../models/loader');

function formatDate(isoString) {
  if (!isoString) {
    return '—';
  }

  return new Date(isoString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function resolveByIds(ids, collection) {
  const lookup = new Map(collection.map((item) => [item.id, item]));
  return ids.map((id) => lookup.get(id)).filter(Boolean);
}

function buildJobOrderView(jobOrder, collections) {
  if (!jobOrder) {
    return null;
  }

  const minorityReport = collections.minority_reports.find(
    (report) => report.id === jobOrder.minority_report_current,
  ) || null;

  const minorityReportPrevious = collections.minority_reports.find(
    (report) => report.id === jobOrder.minority_report_previous,
  ) || null;

  const operatorActions = resolveByIds(jobOrder.operator_actions, collections.operator_actions)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const openOperatorActions = operatorActions.filter((item) => item.status === 'open');

  const timeline = resolveByIds(jobOrder.timeline, collections.timeline)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  return {
    jobOrder,
    minorityReport,
    minorityReportPrevious,
    operatorActions,
    openOperatorActions,
    timeline,
    risks: jobOrder.risks || [],
    formatted: {
      created_at: formatDate(jobOrder.created_at),
      updated_at: formatDate(jobOrder.updated_at),
      current_truth_at: formatDate(jobOrder.current_truth?.recorded_at),
      next_truth_at: formatDate(jobOrder.next_truth?.recorded_at),
      target_truth_at: formatDate(jobOrder.target_truth?.recorded_at),
      human_summary_at: formatDate(jobOrder.human_summary?.updated_at),
      passdown_at: formatDate(jobOrder.passdown?.handed_off_at),
      minority_report_at: formatDate(minorityReport?.updated_at),
      minority_report_previous_at: formatDate(minorityReportPrevious?.updated_at),
    },
    actionFormatted: operatorActions.reduce((acc, action) => {
      acc[action.id] = {
        created_at: formatDate(action.created_at),
        completed_at: formatDate(action.completed_at),
      };
      return acc;
    }, {}),
  };
}

function getCollections() {
  return loadAndValidate();
}

function listJobOrders() {
  const collections = getCollections();
  return collections.job_orders.map((jobOrder) => ({
    id: jobOrder.id,
    title: jobOrder.title,
    status: jobOrder.status,
    mission: jobOrder.mission,
    updated_at: formatDate(jobOrder.updated_at),
  }));
}

function getJobOrderViewById(id) {
  const collections = getCollections();
  const jobOrder = getJobOrderById(id, collections);

  if (!jobOrder) {
    return null;
  }

  return buildJobOrderView(jobOrder, collections);
}

function getPrimaryJobOrderView() {
  const collections = getCollections();
  const active = collections.job_orders.find((jo) => jo.status === 'active');
  const jobOrder = active || collections.job_orders[0] || null;

  return buildJobOrderView(jobOrder, collections);
}

module.exports = {
  formatDate,
  buildJobOrderView,
  getCollections,
  listJobOrders,
  getJobOrderViewById,
  getPrimaryJobOrderView,
};
