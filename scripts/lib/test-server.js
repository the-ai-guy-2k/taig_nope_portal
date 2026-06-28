#!/usr/bin/env node
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function httpRequest(port, pathname, options = {}) {
  const {
    method = 'GET',
    body = null,
    headers = {},
  } = options;

  return new Promise((resolve, reject) => {
    const reqHeaders = { ...headers };

    if (body && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
            location: res.headers.location,
          });
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error(`Timeout requesting ${pathname}`));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

async function followRequest(port, pathname, options = {}, maxRedirects = 5) {
  let currentPath = pathname;
  let currentOptions = { ...options };

  for (let attempt = 0; attempt < maxRedirects; attempt += 1) {
    const response = await httpRequest(port, currentPath, currentOptions);

    if (
      response.statusCode >= 300
      && response.statusCode < 400
      && response.location
    ) {
      const location = response.location;
      currentPath = location.startsWith('http')
        ? new URL(location).pathname
        : location;
      currentOptions = { method: 'GET' };
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects for ${pathname}`);
}

function waitForServer(port, maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts += 1;
      httpRequest(port, '/health')
        .then((result) => {
          if (result.statusCode === 200) {
            resolve();
          } else if (attempts >= maxAttempts) {
            reject(new Error(`Server on port ${port} did not become ready`));
          } else {
            setTimeout(check, 500);
          }
        })
        .catch(() => {
          if (attempts >= maxAttempts) {
            reject(new Error(`Server on port ${port} did not become ready`));
          } else {
            setTimeout(check, 500);
          }
        });
    };

    check();
  });
}

function spawnTestServer(port, extraEnv = {}) {
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  server.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  return {
    server,
    output: () => output,
  };
}

async function withTestServer(port, extraEnv, fn) {
  const { server, output } = spawnTestServer(port, extraEnv);

  try {
    await waitForServer(port);
    return await fn();
  } catch (err) {
    err.serverOutput = output();
    throw err;
  } finally {
    server.kill();
  }
}

module.exports = {
  ROOT,
  httpRequest,
  followRequest,
  waitForServer,
  spawnTestServer,
  withTestServer,
};
