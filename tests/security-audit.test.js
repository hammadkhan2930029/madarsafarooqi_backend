'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'mysql://user:password@localhost:3306/smarthazri_test';
process.env.JWT_ACCESS_SECRET ||= 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET ||= 'b'.repeat(32);

const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const request = require('supertest');
const { app } = require('../src/app');
const { createRateLimiter } = require('../src/middleware/rateLimit');
const { errorHandler } = require('../src/middleware/errorHandler');

test('all protected module roots default-deny missing JWTs', async () => {
  const paths = [
    '/api/branches', '/api/classes', '/api/teachers', '/api/students',
    '/api/attendance/today', '/api/admin/attendance', '/api/reports/me',
    '/api/admin/reports', '/api/leave-requests/me', '/api/admin/leave-requests',
    '/api/admin/payroll/settings', '/api/admin/salaries?month=8&year=2026',
  ];
  for (const path of paths) {
    const response = await request(app).get(path);
    assert.equal(response.status, 401, `${path}: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.error.code, 'AUTH_REQUIRED');
  }
});

test('rate limiter returns a stable safe error after its configured limit', async () => {
  const limiter = createRateLimiter({ windowMs: 60000, limit: 1, code: 'TEST_RATE_LIMITED' });
  const limitedApp = express();
  limitedApp.set('trust proxy', 1);
  limitedApp.get('/limited', limiter, (_req, res) => res.json({ success: true }));
  limitedApp.use(errorHandler);
  await request(limitedApp).get('/limited').expect(200);
  const response = await request(limitedApp).get('/limited').expect(429);
  assert.equal(response.body.error.code, 'TEST_RATE_LIMITED');
  assert.equal(response.body.success, false);
});

test('health remains the only unauthenticated operational endpoint', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.success, true);
});
