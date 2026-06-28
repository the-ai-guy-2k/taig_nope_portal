'use strict';

const express = require('express');
const { getCollections, formatDate } = require('../services/jobOrderService');

const router = express.Router();

const PLACEHOLDERS = [
  { path: '/timeline', nav: 'timeline', title: 'Timeline', description: 'Cross-job-order timeline view will be available in a future ACI.' },
  { path: '/aci-history', nav: 'aci-history', title: 'ACI History', description: 'ACI execution history browser will be available in a future ACI.' },
  { path: '/completion-reports', nav: 'completion-reports', title: 'Completion Reports', description: 'Completion report archive will be available in a future ACI.' },
  { path: '/settings', nav: 'settings', title: 'Settings', description: 'Portal settings will be available in a future ACI.' },
];

function renderPlaceholder(req, res, config) {
  res.render('placeholders/section', {
    pageTitle: config.title,
    activeNav: config.nav,
    title: config.title,
    description: config.description,
  });
}

router.get('/timeline', (req, res) => {
  const collections = getCollections();
  const events = [...collections.timeline].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  res.render('placeholders/timeline', {
    pageTitle: 'Timeline',
    activeNav: 'timeline',
    events,
    formatDate,
  });
});

router.get('/aci-history', (req, res) => {
  const collections = getCollections();
  const acis = [...collections.aci_history].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  res.render('placeholders/aci-history', {
    pageTitle: 'ACI History',
    activeNav: 'aci-history',
    acis,
    formatDate,
  });
});

router.get('/completion-reports', (req, res) => {
  const collections = getCollections();
  const reports = collections.completion_reports;

  res.render('placeholders/completion-reports', {
    pageTitle: 'Completion Reports',
    activeNav: 'completion-reports',
    reports,
    formatDate,
  });
});

router.get('/settings', (req, res) => {
  renderPlaceholder(req, res, PLACEHOLDERS.find((item) => item.nav === 'settings'));
});

module.exports = router;
