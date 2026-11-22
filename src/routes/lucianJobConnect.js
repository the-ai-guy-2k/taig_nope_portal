'use strict';

/* Lucian Job Connect — JSON API (MVP).
   Public like the other Drippy apps. Contact details are never in list
   responses — they are revealed only through POST /connect, which records
   the introduction. All inputs are validated server-side in the store. */

const express = require('express');
const store = require('../services/lucianJobConnectStore');

const router = express.Router();

/* Light per-IP throttle on writes: 30 POSTs a minute per IP. */
const writeHits = new Map();
function throttleWrites(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const hits = (writeHits.get(key) || []).filter((time) => now - time < 60000);
  hits.push(now);
  writeHits.set(key, hits);
  if (hits.length > 30) {
    return res.status(429).json({ error: 'Too many requests — slow down a minute.' });
  }
  return next();
}

function badRequest(res, err) {
  if (err instanceof store.ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Something went wrong saving that.' });
}

router.get('/api/lucian/tags', (req, res) => {
  res.json({ industries: store.INDUSTRIES, skills: store.SKILL_NAMES });
});

router.get('/api/lucian/jobs', (req, res) => {
  res.json({ jobs: store.listJobs() });
});

router.post('/api/lucian/jobs', throttleWrites, (req, res) => {
  try {
    res.status(201).json({ job: store.createJob(req.body || {}) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.get('/api/lucian/workers', (req, res) => {
  res.json({ workers: store.listWorkers() });
});

router.post('/api/lucian/workers', throttleWrites, (req, res) => {
  try {
    res.status(201).json({ worker: store.createWorker(req.body || {}) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.get('/api/lucian/matches', (req, res) => {
  const { jobId, workerId } = req.query;
  if (jobId) {
    const result = store.matchesForJob(String(jobId));
    if (!result) return res.status(404).json({ error: 'Job not found.' });
    return res.json(result);
  }
  if (workerId) {
    const result = store.matchesForWorker(String(workerId));
    if (!result) return res.status(404).json({ error: 'Worker not found.' });
    return res.json(result);
  }
  return res.status(400).json({ error: 'Give a jobId or a workerId.' });
});

router.post('/api/lucian/connect', throttleWrites, (req, res) => {
  try {
    res.json(store.connect(req.body || {}));
  } catch (err) {
    badRequest(res, err);
  }
});

module.exports = router;
