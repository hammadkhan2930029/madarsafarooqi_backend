'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'mysql://user:password@localhost:3306/smarthazri_test';
process.env.JWT_ACCESS_SECRET ||= 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET ||= 'b'.repeat(32);

const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const express = require('express');
const request = require('supertest');

const { createBranchRouter } = require('../src/modules/branches/branch.routes');
const { createBranchService, normalizeCode } = require('../src/modules/branches/branch.service');
const { errorHandler } = require('../src/middleware/errorHandler');
const { prisma } = require('../src/config/database');

after(() => prisma.$disconnect());

const branch = { id: '1', name: 'Main Campus', code: 'MAIN-01', address: 'Main Road', contact: null, status: 'ACTIVE', createdById: '1' };
const makeApp = (role, service) => {
  const app = express();
  app.use(express.json());
  app.use('/api/branches', createBranchRouter(service, (req, _res, next) => { req.auth = { userId: role === 'TEACHER' ? '2' : '1', role }; next(); }));
  app.use(errorHandler);
  return app;
};

test('normalizes branch codes', () => assert.equal(normalizeCode(' main-01 '), 'MAIN-01'));

test('Super Admin can create a validated branch', async () => {
  const service = { create: async (values, auth) => ({ ...branch, code: normalizeCode(values.code), createdById: auth.userId }) };
  const response = await request(makeApp('SUPER_ADMIN', service)).post('/api/branches')
    .send({ name: 'Main Campus', code: 'main-01', address: 'Main Road', contact: null, classes: ['Hifz', 'Nazra'] });
  assert.equal(response.status, 201);
  assert.equal(response.body.data.code, 'MAIN-01');
});

test('Teacher cannot create or update branches', async () => {
  const service = {};
  const createResponse = await request(makeApp('TEACHER', service)).post('/api/branches')
    .send({ name: 'Main Campus', code: 'MAIN-01', address: 'Main Road', contact: null, classes: ['Hifz'] });
  const updateResponse = await request(makeApp('TEACHER', service)).patch('/api/branches/1')
    .send({ name: 'Changed Name' });
  assert.equal(createResponse.status, 403);
  assert.equal(updateResponse.status, 403);
  assert.equal(createResponse.body.error.code, 'FORBIDDEN');
});

test('branch creation requires unique class names', async () => {
  const service = { create: async () => branch };
  const missing = await request(makeApp('SUPER_ADMIN', service)).post('/api/branches')
    .send({ name: 'Main Campus', code: 'MAIN-01', address: 'Main Road', contact: null, classes: [] });
  const duplicate = await request(makeApp('SUPER_ADMIN', service)).post('/api/branches')
    .send({ name: 'Main Campus', code: 'MAIN-01', address: 'Main Road', contact: null, classes: ['Hifz', ' hifz '] });
  assert.equal(missing.status, 422);
  assert.equal(duplicate.status, 422);
});

test('branch and its classes are created atomically with class details', async () => {
  let branchData; let classData; let transactionUsed = false;
  const created = { id: 10n, name: 'Main Campus', code: 'MAIN', address: 'Main Road', contact: null, status: 'ACTIVE', createdById: 1n, createdAt: new Date(), updatedAt: new Date() };
  const transaction = {
    branch: {
      create: async args => { branchData = args.data; return created; },
      findUnique: async () => ({ ...created, classes: [
        { id: 20n, name: 'Hifz', status: 'ACTIVE' }, { id: 21n, name: 'Nazra', status: 'ACTIVE' },
      ], _count: { classes: 2 } }),
    },
    class: { createMany: async args => { classData = args.data; return { count: args.data.length }; } },
  };
  const database = { $transaction: async callback => { transactionUsed = true; return callback(transaction); } };
  const result = await createBranchService(database).create({
    name: 'Main Campus', code: 'main', address: 'Main Road', contact: null, classes: ['Hifz', 'Nazra'],
  }, { userId: '1', role: 'SUPER_ADMIN' });
  assert.equal(transactionUsed, true);
  assert.equal(branchData.code, 'MAIN');
  assert.deepEqual(classData.map(item => item.normalizedName), ['hifz', 'nazra']);
  assert.equal(result.classCount, 2);
  assert.deepEqual(result.classes.map(item => item.name), ['Hifz', 'Nazra']);
});

test('list forwards search, status and pagination to the scoped service', async () => {
  let received;
  const service = { list: async (query, auth) => { received = { query, auth }; return { items: [branch], pagination: { page: query.page, limit: query.limit, total: 1, totalPages: 1 } }; } };
  const response = await request(makeApp('TEACHER', service)).get('/api/branches?search=main&status=ACTIVE&page=2&limit=10');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(received.query, { search: 'main', status: 'ACTIVE', page: 2, limit: 10 });
  assert.equal(received.auth.role, 'TEACHER');
  assert.equal(response.body.meta.total, 1);
});

test('invalid status and identifiers return safe validation errors', async () => {
  const service = { list: async () => ({ items: [], pagination: {} }), get: async () => branch };
  const invalidStatus = await request(makeApp('SUPER_ADMIN', service)).get('/api/branches?status=DELETED');
  const invalidId = await request(makeApp('SUPER_ADMIN', service)).get('/api/branches/not-a-number');
  assert.equal(invalidStatus.status, 422);
  assert.equal(invalidId.status, 422);
  assert.equal(invalidStatus.body.error.code, 'VALIDATION_ERROR');
});
