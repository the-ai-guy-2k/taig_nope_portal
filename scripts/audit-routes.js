#!/usr/bin/env node
'use strict';

/**
 * Operator-style route audit for the default application port.
 * Detects stale ACI-001 servers that mask the current dashboard.
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const LEGACY_MARKERS = [
  'Version: MVP Foundation',
  'Repository foundation established',
  '"version":"MVP Foundation"',
];
const DASHBOARD_MARKERS = ['workspace-main', 'Local Preservation', 'sidebar'];

const ROUTES = [
  '/',
  '/dashboard',
  '/job-orders',
  '/job-orders/jo-aci-002-seed',
  '/timeline',
  '/aci-history',
  '/completion-reports',
  '/settings',
  '/health',
];

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${PORT}${pathname}`, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body });
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error(`Timeout requesting ${pathname}`));
    });
  });
}

async function main() {
  const failures = [];
  let legacyDetected = false;

  console.log(`Auditing routes on http://127.0.0.1:${PORT} (operator port)...`);

  try {
    await request('/health');
  } catch (err) {
    console.error(`No server responding on port ${PORT}. Run: npm start`);
    process.exit(1);
  }

  for (const route of ROUTES) {
    const result = await request(route);

    if (result.statusCode !== 200) {
      failures.push(`${route}: HTTP ${result.statusCode} (expected 200)`);
      continue;
    }

    for (const marker of LEGACY_MARKERS) {
      if (result.body.includes(marker)) {
        legacyDetected = true;
        failures.push(`${route}: legacy ACI-001 content detected ("${marker}")`);
      }
    }

    if (route !== '/health') {
      const hasDashboard = DASHBOARD_MARKERS.some((marker) => result.body.includes(marker));
      if (!hasDashboard && route !== '/settings') {
        failures.push(`${route}: missing dashboard shell markers`);
      }
    }
  }

  if (legacyDetected) {
    console.error('');
    console.error('STALE SERVER DETECTED on port ' + PORT);
    console.error('An old ACI-001 process is likely still running.');
    console.error('Stop it before starting the current application.');
    console.error('');
  }

  if (failures.length > 0) {
    console.error('Route audit failed:');
    failures.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log(`Route audit passed (${ROUTES.length} routes on port ${PORT}).`);
  console.log('GET / serves the execution dashboard (not the ACI-001 landing page).');
}

main();
