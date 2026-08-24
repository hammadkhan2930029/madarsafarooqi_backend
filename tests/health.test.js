'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mysql://user:password@localhost:3306/smart_hazri_test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars_long';
process.env.CORS_ORIGINS = 'http://localhost:8081';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/app');

test('GET /api/health returns the standard success response', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.deepEqual(response.body, { success: true, message: 'API is running' });
});

test('unknown routes return the standard error response', async () => {
  const response = await request(app).get('/api/unknown').expect(404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});
