'use strict';

/**
 * TAIG Online Music Store — store API routes (MVP).
 *
 * GET /music-store/api/catalog — the store catalog (artists, albums, tracks,
 * products) from SQLite. The storefront pages render from this endpoint.
 *
 * No checkout, no orders, no payment routes in the MVP. Payment is still in
 * process; buy buttons in the storefront show "payment coming soon".
 */

const express = require('express');

const router = express.Router();
const { getCatalog } = require('../services/musicStoreDb');

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

module.exports = router;
