'use strict';

const express = require('express');
const { listJobOrders, getJobOrderViewById } = require('../services/jobOrderService');

const router = express.Router();

router.get('/', (req, res) => {
  const jobOrders = listJobOrders();

  res.render('job-orders/list', {
    pageTitle: 'Job Orders',
    activeNav: 'job-orders',
    jobOrders,
  });
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
