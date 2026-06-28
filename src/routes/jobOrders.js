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
const { getJobOrderById } = require('../models/loader');

const router = express.Router();

function renderForm(res, options) {
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

router.get('/', (req, res) => {
  const jobOrders = listJobOrders();

  res.render('job-orders/list', {
    pageTitle: 'Job Orders',
    activeNav: 'job-orders',
    jobOrders,
  });
});

router.get('/new', (req, res) => {
  renderForm(res, {
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
    return renderForm(res, {
      pageTitle: 'Create Job Order',
      formAction: '/job-orders',
      isEdit: false,
      values: { ...formDefaults(), ...req.body },
      errors,
    });
  }
});

router.get('/:id/edit', (req, res) => {
  const existing = getJobOrderById(req.params.id);

  if (!existing) {
    return res.status(404).render('errors/not-found', {
      pageTitle: 'Job Order Not Found',
      message: `Job Order "${req.params.id}" was not found.`,
      activeNav: 'job-orders',
    });
  }

  renderForm(res, {
    pageTitle: `Edit ${existing.title}`,
    formAction: `/job-orders/${existing.id}`,
    isEdit: true,
    values: formDefaults(existing),
  });
});

router.post('/:id', (req, res) => {
  try {
    const jobOrder = updateJobOrder(req.params.id, req.body);
    return res.redirect(`/job-orders/${jobOrder.id}`);
  } catch (err) {
    const existing = getJobOrderById(req.params.id);

    if (!existing) {
      return res.status(404).render('errors/not-found', {
        pageTitle: 'Job Order Not Found',
        message: `Job Order "${req.params.id}" was not found.`,
        activeNav: 'job-orders',
      });
    }

    const errors = err instanceof PersistenceError ? err.errors : [err.message];
    return renderForm(res, {
      pageTitle: `Edit ${existing.title}`,
      formAction: `/job-orders/${existing.id}`,
      isEdit: true,
      values: { ...formDefaults(existing), ...req.body },
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
