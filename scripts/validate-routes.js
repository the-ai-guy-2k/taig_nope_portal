#!/usr/bin/env node
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.VALIDATE_PORT || 3099;
const ROOT = path.join(__dirname, '..');

const ROUTES = [
  { path: '/', expect: 'ACI-002 Data Model Foundation' },
  { path: '/dashboard', expect: 'ACI-002 Data Model Foundation' },
  { path: '/job-orders', expect: 'Job Orders' },
  { path: '/job-orders/new', expect: 'Create Job Order' },
  { path: '/job-orders/jo-aci-002-seed', expect: 'ACI-002 Data Model Foundation' },
  { path: '/job-orders/jo-aci-002-seed/edit', expect: 'Edit Job Order' },
  { path: '/timeline', expect: 'Timeline' },
  { path: '/aci-history', expect: 'ACI History' },
  { path: '/completion-reports', expect: 'Completion Reports' },
  { path: '/settings', expect: 'Settings' },
  { path: '/health', expect: '"status":"ok"' },
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

function waitForServer(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts += 1;
      request('/health')
        .then((result) => {
          if (result.statusCode === 200) {
            resolve();
          } else if (attempts >= maxAttempts) {
            reject(new Error('Server did not become ready'));
          } else {
            setTimeout(check, 500);
          }
        })
        .catch(() => {
          if (attempts >= maxAttempts) {
            reject(new Error('Server did not become ready'));
          } else {
            setTimeout(check, 500);
          }
        });
    };

    check();
  });
}

async function validateRoutes() {
  const failures = [];

  for (const route of ROUTES) {
    const result = await request(route.path);

    if (result.statusCode !== 200) {
      failures.push(`${route.path}: expected HTTP 200, got ${result.statusCode}`);
      continue;
    }

    if (!result.body.includes(route.expect)) {
      failures.push(`${route.path}: response missing expected content "${route.expect}"`);
    }
  }

  return failures;
}

async function main() {
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverOutput = '';
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    await waitForServer();
    const failures = await validateRoutes();

    if (failures.length > 0) {
      console.error('Route validation failed:');
      failures.forEach((item) => console.error(`  - ${item}`));
      process.exitCode = 1;
      return;
    }

    console.log(`Route validation passed (${ROUTES.length} routes).`);
  } catch (err) {
    console.error(`Route validation error: ${err.message}`);
    if (serverOutput) {
      console.error(serverOutput);
    }
    process.exitCode = 1;
  } finally {
    server.kill();
  }
}

main();
