'use strict';

const express = require('express');
const { getPrimaryJobOrderView } = require('../services/jobOrderService');

const router = express.Router();

function renderDashboard(req, res) {
  const view = getPrimaryJobOrderView();

  if (!view) {
    return res.status(404).render('errors/not-found', {
      pageTitle: 'No Job Orders',
      message: 'No Job Orders are available.',
      activeNav: 'dashboard',
    });
  }

  res.render('dashboard/workspace', {
    pageTitle: 'Dashboard',
    activeNav: 'dashboard',
    view,
  });
}

router.get('/', renderDashboard);

router.get('/dashboard', renderDashboard);

module.exports = router;
