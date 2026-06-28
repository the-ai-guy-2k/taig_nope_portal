'use strict';

/**
 * Field definitions and required keys for NOPE Lite execution objects.
 * Used by validators; Job Order is the root object.
 */

const JOB_ORDER_STATUSES = ['draft', 'active', 'blocked', 'complete', 'archived'];
const MINORITY_REPORT_STATUSES = ['open', 'resolved', 'superseded', 'archived'];
const OPERATOR_ACTION_STATUSES = ['open', 'completed', 'archived'];
const RISK_SEVERITIES = ['low', 'medium', 'high'];
const RISK_STATUSES = ['open', 'mitigated', 'accepted'];
const ACI_STATUSES = ['planned', 'in_progress', 'complete', 'cancelled'];

const SCHEMAS = {
  currentTruth: {
    required: ['statement', 'recorded_at'],
    optional: ['source', 'recorded_by'],
  },
  nextTruth: {
    required: ['statement', 'recorded_at'],
    optional: ['rationale'],
  },
  targetTruth: {
    required: ['statement', 'recorded_at'],
    optional: ['criteria'],
  },
  humanSummary: {
    required: ['summary', 'updated_at'],
    optional: ['author'],
  },
  checklistItem: {
    required: ['text', 'completed'],
    optional: [],
  },
  minorityReport: {
    required: [
      'id',
      'job_order_id',
      'title',
      'status',
      'created_at',
      'updated_at',
      'mission',
      'current_phase',
      'human_summary',
      'current_truth',
      'completed',
      'remaining',
      'risk',
      'next_truth',
      'next_action',
      'target',
    ],
    optional: ['content'],
    enums: { status: MINORITY_REPORT_STATUSES },
  },
  operatorAction: {
    required: ['id', 'job_order_id', 'action', 'operator', 'status', 'created_at'],
    optional: ['notes', 'completed_at'],
    enums: { status: OPERATOR_ACTION_STATUSES },
    arrays: ['checklist'],
    arrayItems: { checklist: 'checklistItem' },
  },
  aci: {
    required: ['id', 'number', 'title', 'status', 'created_at'],
    optional: ['job_order_id', 'completed_at'],
    enums: { status: ACI_STATUSES },
  },
  completionReport: {
    required: ['id', 'job_order_id', 'title', 'status', 'created_at'],
    optional: ['aci_id', 'content'],
  },
  timelineEvent: {
    required: ['id', 'job_order_id', 'event_type', 'description', 'created_at'],
    optional: ['actor'],
  },
  risk: {
    required: ['id', 'description', 'severity', 'status', 'created_at'],
    optional: [],
    enums: { severity: RISK_SEVERITIES, status: RISK_STATUSES },
  },
  artifactReference: {
    required: ['id', 'name', 'created_at'],
    optional: ['path', 'type'],
  },
  passdown: {
    required: ['summary', 'handed_off_at'],
    optional: ['next_steps', 'handed_off_by'],
  },
  jobOrder: {
    required: [
      'id',
      'title',
      'mission',
      'status',
      'current_truth',
      'next_truth',
      'target_truth',
      'human_summary',
      'minority_report_current',
      'minority_report_previous',
      'aep',
      'acis',
      'operator_actions',
      'completion_reports',
      'timeline',
      'risks',
      'artifacts',
      'passdown',
      'created_at',
      'updated_at',
    ],
    optional: [],
    enums: { status: JOB_ORDER_STATUSES },
    arrays: ['acis', 'operator_actions', 'completion_reports', 'timeline'],
    arrayItems: {
      risks: 'risk',
      artifacts: 'artifactReference',
    },
    nested: {
      current_truth: 'currentTruth',
      next_truth: 'nextTruth',
      target_truth: 'targetTruth',
      human_summary: 'humanSummary',
      passdown: 'passdown',
    },
    nullable: ['minority_report_current', 'minority_report_previous', 'passdown'],
  },
};

const DATA_FILES = {
  job_orders: { path: 'job_orders.json', key: 'job_orders', itemSchema: 'jobOrder', idField: 'id' },
  aci_history: { path: 'aci_history.json', key: 'aci_history', itemSchema: 'aci', idField: 'id' },
  minority_reports: { path: 'minority_reports.json', key: 'minority_reports', itemSchema: 'minorityReport', idField: 'id' },
  operator_actions: { path: 'operator_actions.json', key: 'operator_actions', itemSchema: 'operatorAction', idField: 'id' },
  completion_reports: { path: 'completion_reports.json', key: 'completion_reports', itemSchema: 'completionReport', idField: 'id' },
  timeline: { path: 'timeline.json', key: 'timeline', itemSchema: 'timelineEvent', idField: 'id' },
};

module.exports = {
  SCHEMAS,
  DATA_FILES,
  JOB_ORDER_STATUSES,
  MINORITY_REPORT_STATUSES,
  OPERATOR_ACTION_STATUSES,
  RISK_SEVERITIES,
  RISK_STATUSES,
  ACI_STATUSES,
};
