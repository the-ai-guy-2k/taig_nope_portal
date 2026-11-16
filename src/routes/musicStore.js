'use strict';

/**
 * TAIG Online Music Store — store API routes (MVP).
 *
 * GET /music-store/api/catalog — the store catalog (artists, albums, tracks,
 * products) from SQLite. The storefront pages render from this endpoint.
 *
 * POST /music-store/api/event — first-party stats: one counted action per
 * call (pageview is server-side; preview plays, cart adds, genre filters,
 * artist clicks and checkout notices come from the storefront). No PII.
 *
 * GET /music-store/api/stats — aggregate stats for the store dashboard
 * (?days=30 default, max 365).
 *
 * No checkout, no orders, no payment routes in the MVP. Payment is still in
 * process; buy buttons in the storefront show "payment coming soon".
 */

const express = require('express');

const router = express.Router();
const { getCatalog, recordEvent, getStats } = require('../services/musicStoreDb');

router.get('/music-store/api/catalog', async (req, res) => {
  try {
    const catalog = await getCatalog();
    res.json(catalog);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('music-store catalog error:', err);
    res.status(500).json({ error: 'catalog unavailable' });
  }
});

router.post('/music-store/api/event', async (req, res) => {
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
    console.error('music-store event error:', err);
    res.status(500).end();
  }
});

router.get('/music-store/api/stats', async (req, res) => {
  try {
    const stats = await getStats(parseInt(req.query.days, 10));
    res.json(stats);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('music-store stats error:', err);
    res.status(500).json({ error: 'stats unavailable' });
  }
});

module.exports = router;
