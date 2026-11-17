'use strict';

/**
 * Tee's Sports Report — stats API routes.
 *
 * POST /sports-report/api/event — first-party stats: one counted action
 * per call (pageview on load, section_view on every route change — the
 * report page sends them; see the page). No PII.
 *
 * GET /sports-report/api/stats — aggregate stats for the report dashboard
 * (?days=30 default, max 365).
 *
 * Mirrors the music store's routes (src/routes/musicStore.js) exactly,
 * against the sports-report database (src/services/sportsReportDb.js).
 */

const express = require('express');

const router = express.Router();
const { recordEvent, getStats } = require('../services/sportsReportDb');

router.post('/sports-report/api/event', async (req, res) => {
  try {
    const body = req.body || {};
    const ok = await recordEvent(
      req,
      String(body.type || ''),
      String(body.detail || ''),
      String(body.page || ''),
    );
    res.status(ok ? 204 : 400).end();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('sports-report event error:', err);
    res.status(500).end();
  }
});

router.get('/sports-report/api/stats', async (req, res) => {
  try {
    const stats = await getStats(parseInt(req.query.days, 10));
    res.json(stats);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('sports-report stats error:', err);
    res.status(500).json({ error: 'stats unavailable' });
  }
});

module.exports = router;
