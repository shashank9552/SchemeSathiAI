process.env.NODE_ENV = 'test';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { app } from '../src/server.js';
import { errorHandler, sanitizeLog } from '../src/middleware/errorHandler.js';

// Helper to launch an ephemeral HTTP server on a random free port
async function startEphemeralServer(expressApp: express.Express): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = expressApp.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number; address: string };
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test('Security Headers - Helmet applies security headers', async () => {
  const { server, url } = await startEphemeralServer(app);
  try {
    const res = await fetch(`${url}/api/health`);
    assert.equal(res.status, 200);

    const headers = res.headers;
    // Check key helmet headers
    assert.equal(headers.get('x-content-type-options'), 'nosniff', 'X-Content-Type-Options must be nosniff');
    assert.equal(headers.get('x-dns-prefetch-control'), 'off', 'X-DNS-Prefetch-Control must be off');
    assert.equal(headers.get('x-frame-options'), 'SAMEORIGIN', 'X-Frame-Options must be SAMEORIGIN');
    assert.ok(headers.get('content-security-policy') !== null, 'Content-Security-Policy must be present');
  } finally {
    server.close();
  }
});

test('CORS - Restricted to CORS_ORIGIN', async () => {
  const { server, url } = await startEphemeralServer(app);
  try {
    const res = await fetch(`${url}/api/health`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  } finally {
    server.close();
  }
});

test('Validation 400 - Rejects empty message', async () => {
  const { server, url } = await startEphemeralServer(app);
  try {
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Validation failed');
    assert.ok(body.details.some((d: string) => d.includes('Message cannot be empty')));
  } finally {
    server.close();
  }
});

test('Validation 400 - Rejects message exceeding 500 characters', async () => {
  const { server, url } = await startEphemeralServer(app);
  try {
    const longMessage = 'A'.repeat(501);
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: longMessage }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Validation failed');
    assert.ok(body.details.some((d: string) => d.includes('500 characters')));
  } finally {
    server.close();
  }
});

test('Body Size Limit 413 - Rejects payload exceeding 10kb', async () => {
  const { server, url } = await startEphemeralServer(app);
  try {
    // Generate a payload larger than 10kb (12,000 bytes)
    const largePayload = { message: 'hello', junk: 'x'.repeat(12000) };
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(largePayload),
    });
    assert.equal(res.status, 413, 'Must return 413 Payload Too Large');
    const body = await res.json();
    assert.ok(body.error.includes('exceeds allowable limit'));
  } finally {
    server.close();
  }
});

test('Rate Limiter 429 - Returns 429 Too Many Requests when limit exceeded', async () => {
  // Create an isolated instance with a tiny limit of 2 requests for fast deterministic test
  const testApp = express();
  testApp.use(
    rateLimit({
      windowMs: 60000,
      limit: 2,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests. Please try again after a minute.' },
    }),
  );
  testApp.get('/test', (_req, res) => res.json({ ok: true }));

  const { server, url } = await startEphemeralServer(testApp);
  try {
    const res1 = await fetch(`${url}/test`);
    assert.equal(res1.status, 200);

    const res2 = await fetch(`${url}/test`);
    assert.equal(res2.status, 200);

    const res3 = await fetch(`${url}/test`);
    assert.equal(res3.status, 429, '3rd request must trigger 429 Too Many Requests');
    const body = await res3.json();
    assert.ok(body.error.includes('Too many requests'));
  } finally {
    server.close();
  }
});

test('Centralised Error Handling - Never leaks stack trace or sensitive keys', async () => {
  // Test error handler directly with synthetic error
  const testApp = express();
  testApp.get('/error-with-secret', () => {
    const sensitiveErr = new Error('Connection failed to mongodb+srv://admin:SecretPass123@cluster0.bseuo68.mongodb.net/schemesathi');
    throw sensitiveErr;
  });
  testApp.use(errorHandler);

  const { server, url } = await startEphemeralServer(testApp);
  try {
    const res = await fetch(`${url}/error-with-secret`);
    assert.equal(res.status, 500);
    const body = await res.json();

    // Verify response structure
    assert.equal(body.error, 'Internal server error.');
    assert.equal(body.stack, undefined, 'Stack trace must NEVER be present in response');
    assert.equal(JSON.stringify(body).includes('SecretPass123'), false, 'Password must never be exposed');
    assert.equal(JSON.stringify(body).includes('mongodb+srv'), false, 'MongoDB connection string must never be exposed');
  } finally {
    server.close();
  }
});

test('Sanitization Helper - Redacts credentials and API keys in logs', () => {
  const rawLog = 'Error connecting to mongodb+srv://app_user:MySecurePass@atlas.mongodb.net with key AIzaSyD1234567890abcdefghijklmnopqrstuv';
  const sanitized = sanitizeLog(rawLog);

  assert.ok(!sanitized.includes('MySecurePass'), 'Must redact passwords in URI');
  assert.ok(!sanitized.includes('AIzaSyD1234567890abcdefghijklmnopqrstuv'), 'Must redact Google API key');
  assert.ok(sanitized.includes('[REDACTED_MONGODB_URI]'));
  assert.ok(sanitized.includes('[REDACTED_API_KEY]'));
});
