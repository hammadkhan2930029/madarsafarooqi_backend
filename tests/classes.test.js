'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'mysql://user:password@localhost:3306/smarthazri_test';
process.env.JWT_ACCESS_SECRET ||= 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET ||= 'b'.repeat(32);

const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const express = require('express');
const request = require('supertest');

const { createClassRouter } = require('../src/modules/classes/class.routes');
const { createClassService, normalizeClassName } = require('../src/modules/classes/class.service');
const { errorHandler } = require('../src/middleware/errorHandler');
const { prisma } = require('../src/config/database');

after(() => prisma.$disconnect());
const item = { id: '1', name: 'Grade One', normalizedName: 'grade one', branchId: '1', branch: { id: '1', name: 'Main Campus', code: 'MAIN', status: 'ACTIVE' }, status: 'ACTIVE', createdById: '1' };
const makeApp = (role, service) => {
  const app = express();
  app.use(express.json());
  app.use('/api/classes', createClassRouter(service, (req, _res, next) => { req.auth = { userId: role === 'TEACHER' ? '2' : '1', role }; next(); }));
  app.use(errorHandler);
  return app;
};

test('normalizes class names for branch-scoped uniqueness', () => {
  assert.equal(normalizeClassName('  Grade   ONE '), 'grade one');
});

test('Super Admin can create a validated class', async () => {
  const service = { create: async values => ({ ...item, name: values.name, branchId: values.branchId }) };
  const response = await request(makeApp('SUPER_ADMIN', service)).post('/api/classes').send({ name: 'Grade One', branchId: '1' });
  assert.equal(response.status, 201);
  assert.equal(response.body.data.branchId, '1');
});

test('Teacher cannot create or update classes', async () => {
  const createResponse = await request(makeApp('TEACHER', {})).post('/api/classes').send({ name: 'Grade One', branchId: '1' });
  const updateResponse = await request(makeApp('TEACHER', {})).patch('/api/classes/1').send({ name: 'Changed' });
  assert.equal(createResponse.status, 403);
  assert.equal(updateResponse.status, 403);
  assert.equal(createResponse.body.error.code, 'FORBIDDEN');
});

test('list forwards branch, status, search and pagination filters', async () => {
  let received;
  const service = { list: async (query, auth) => { received = { query, auth }; return { items: [item], pagination: { page: 2, limit: 10, total: 1, totalPages: 1 } }; } };
  const response = await request(makeApp('SUPER_ADMIN', service)).get('/api/classes?branchId=1&status=ACTIVE&search=grade&page=2&limit=10');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(received.query, { branchId: '1', status: 'ACTIVE', search: 'grade', page: 2, limit: 10 });
  assert.equal(response.body.data[0].branch.name, 'Main Campus');
});

test('inactive branches cannot receive new classes', async () => {
  const service = createClassService({ branch: { findUnique: async () => ({ id: 1n, status: 'INACTIVE' }) } });
  await assert.rejects(() => service.create({ name: 'Grade One', branchId: '1' }, { userId: '1', role: 'SUPER_ADMIN' }), error => error.code === 'BRANCH_INACTIVE');
});

test('existing class can be renamed while its branch is inactive', async () => {
  let updated;
  const existing = { id: 1n, name: 'Old', normalizedName: 'old', branchId: 1n, status: 'ACTIVE', createdById: 1n, createdAt: new Date(), updatedAt: new Date(), branch: { id: 1n, name: 'Old Branch', code: 'OLD', status: 'INACTIVE' } };
  const database = { class: {
    findFirst: async () => existing,
    update: async args => { updated = args; return { ...existing, name: args.data.name, normalizedName: args.data.normalizedName }; },
  } };
  const result = await createClassService(database).update('1', { name: 'Renamed' }, { userId: '1', role: 'SUPER_ADMIN' });
  assert.equal(result.name, 'Renamed');
  assert.equal(updated.data.normalizedName, 'renamed');
});

test('invalid filters and identifiers return safe validation errors', async () => {
  const service = { list: async () => ({ items: [], pagination: {} }), get: async () => item };
  const invalidBranch = await request(makeApp('SUPER_ADMIN', service)).get('/api/classes?branchId=bad');
  const invalidId = await request(makeApp('SUPER_ADMIN', service)).get('/api/classes/0');
  assert.equal(invalidBranch.status, 422);
  assert.equal(invalidId.status, 422);
  assert.equal(invalidId.body.error.code, 'VALIDATION_ERROR');
});
