'use strict';

const express = require('express');
const { listJobOrders, getJobOrderViewById } = require('../services/jobOrderService');
const {
  createJobOrder,
  updateJobOrder,
  formDefaults,
  PersistenceError,
  JOB_ORDER_STATUSES,
  RISK_SEVERITIES,
  RISK_STATUSES,
} = require('../services/jobOrderPersistence');
const {
  listOperatorActionsForJobOrder,
  getOperatorAction,
  createOperatorAction,
  updateOperatorAction,
  completeOperatorAction,
  archiveOperatorAction,
  formDefaults: operatorFormDefaults,
  PersistenceError: OperatorPersistenceError,
  OPERATOR_ACTION_STATUSES,
} = require('../services/operatorActionPersistence');
const {
  saveMinorityReport,
  formDefaults: minorityFormDefaults,
  PersistenceError: MinorityPersistenceError,
} = require('../services/minorityReportPersistence');
const { getJobOrderById } = require('../models/loader');
const { formatDate } = require('../services/jobOrderService');

const router = express.Router();

function renderJobOrderForm(res, options) {
  res.render('job-orders/form', {
    pageTitle: options.pageTitle,
    activeNav: 'job-orders',
    formAction: options.formAction,
    formMethod: 'post',
    isEdit: options.isEdit,
    values: options.values,
    errors: options.errors || [],
    statuses: JOB_ORDER_STATUSES,
    riskSeverities: RISK_SEVERITIES,
    riskStatuses: RISK_STATUSES,
  });
}

function requireJobOrder(req, res, next) {
  const jobOrder = getJobOrderById(req.params.id);
  if (!jobOrder) {
    return res.status(404).render('errors/not-found', {
      pageTitle: 'Job Order Not Found',
      message: `Job Order "${req.params.id}" was not found.`,
      activeNav: 'job-orders',
    });
  }
  req.jobOrder = jobOrder;
  return next();
}

router.get('/', (req, res) => {
  res.render('job-orders/list', {
    pageTitle: 'Job Orders',
    activeNav: 'job-orders',
    jobOrders: listJobOrders(),
  });
});

router.get('/new', (req, res) => {
  renderJobOrderForm(res, {
    pageTitle: 'Create Job Order',
    formAction: '/job-orders',
    isEdit: false,
    values: formDefaults(),
  });
});

router.post('/', (req, res) => {
  try {
    const jobOrder = createJobOrder(req.body);
    return res.redirect(`/job-orders/${jobOrder.id}`);
  } catch (err) {
    const errors = err instanceof PersistenceError ? err.errors : [err.message];
    return renderJobOrderForm(res, {
      pageTitle: 'Create Job Order',
      formAction: '/job-orders',
      isEdit: false,
      values: { ...formDefaults(), ...req.body },
      errors,
    });
  }
});

router.get('/:id/operator-actions', requireJobOrder, (req, res) => {
  const actions = listOperatorActionsForJobOrder(req.params.id);

  res.render('job-orders/operator-actions', {
    pageTitle: 'Operator Actions',
    activeNav: 'job-orders',
    jobOrder: req.jobOrder,
    actions,
    formatDate,
    statuses: OPERATOR_ACTION_STATUSES,
    formValues: operatorFormDefaults(),
    errors: [],
  });
});

router.post('/:id/operator-actions', requireJobOrder, (req, res) => {
  try {
    createOperatorAction(req.params.id, req.body);
    return res.redirect(`/job-orders/${req.params.id}/operator-actions`);
  } catch (err) {
    const errors = err instanceof OperatorPersistenceError ? err.errors : [err.message];
    return res.render('job-orders/operator-actions', {
      pageTitle: 'Operator Actions',
      activeNav: 'job-orders',
      jobOrder: req.jobOrder,
      actions: listOperatorActionsForJobOrder(req.params.id),
      formatDate,
      statuses: OPERATOR_ACTION_STATUSES,
      formValues: { ...operatorFormDefaults(), ...req.body },
      errors,
    });
  }
});

router.post('/:id/operator-actions/:actionId', requireJobOrder, (req, res) => {
  const { id: jobOrderId, actionId } = req.params;
  const intent = String(req.body.intent || 'update').trim();

  try {
    if (intent === 'complete') {
      completeOperatorAction(jobOrderId, actionId);
    } else if (intent === 'archive') {
      archiveOperatorAction(jobOrderId, actionId);
    } else {
      updateOperatorAction(jobOrderId, actionId, req.body);
    }
    return res.redirect(`/job-orders/${jobOrderId}/operator-actions`);
  } catch (err) {
    const errors = err instanceof OperatorPersistenceError ? err.errors : [err.message];
    const existing = getOperatorAction(jobOrderId, actionId);
    return res.render('job-orders/operator-actions', {
      pageTitle: 'Operator Actions',
      activeNav: 'job-orders',
      jobOrder: req.jobOrder,
      actions: listOperatorActionsForJobOrder(jobOrderId),
      formatDate,
      statuses: OPERATOR_ACTION_STATUSES,
      formValues: operatorFormDefaults(),
      errors,
      editingAction: existing,
      editValues: { ...operatorFormDefaults(existing), ...req.body },
    });
  }
});

router.get('/:id/minority-report/edit', requireJobOrder, (req, res) => {
  const view = getJobOrderViewById(req.params.id);

  res.render('job-orders/minority-report-form', {
    pageTitle: 'Minority Report',
    activeNav: 'job-orders',
    jobOrder: req.jobOrder,
    currentReport: view?.minorityReport || null,
    previousReport: view?.minorityReportPrevious || null,
    values: minorityFormDefaults(req.jobOrder, view?.minorityReport),
    errors: [],
  });
});

router.post('/:id/minority-report', requireJobOrder, (req, res) => {
  try {
    saveMinorityReport(req.params.id, req.body);
    return res.redirect(`/job-orders/${req.params.id}`);
  } catch (err) {
    const errors = err instanceof MinorityPersistenceError ? err.errors : [err.message];
    const view = getJobOrderViewById(req.params.id);
    return res.render('job-orders/minority-report-form', {
      pageTitle: 'Minority Report',
      activeNav: 'job-orders',
      jobOrder: req.jobOrder,
      currentReport: view?.minorityReport || null,
      previousReport: view?.minorityReportPrevious || null,
      values: { ...minorityFormDefaults(req.jobOrder, view?.minorityReport), ...req.body },
      errors,
    });
  }
});

router.get('/:id/edit', requireJobOrder, (req, res) => {
  renderJobOrderForm(res, {
    pageTitle: `Edit ${req.jobOrder.title}`,
    formAction: `/job-orders/${req.jobOrder.id}`,
    isEdit: true,
    values: formDefaults(req.jobOrder),
  });
});

router.post('/:id', requireJobOrder, (req, res) => {
  try {
    const jobOrder = updateJobOrder(req.params.id, req.body);
    return res.redirect(`/job-orders/${jobOrder.id}`);
  } catch (err) {
    const errors = err instanceof PersistenceError ? err.errors : [err.message];
    return renderJobOrderForm(res, {
      pageTitle: `Edit ${req.jobOrder.title}`,
      formAction: `/job-orders/${req.jobOrder.id}`,
      isEdit: true,
      values: { ...formDefaults(req.jobOrder), ...req.body },
      errors,
    });
  }
});

router.get('/:id', (req, res) => {
  const view = getJobOrderViewById(req.params.id);

  if (!view) {
    return res.status(404).render('errors/not-found', {
      pageTitle: 'Job Order Not Found',
      message: `Job Order "${req.params.id}" was not found.`,
      activeNav: 'job-orders',
    });
  }

  res.render('dashboard/workspace', {
    pageTitle: view.jobOrder.title,
    activeNav: 'job-orders',
    view,
  });
});

module.exports = router;
