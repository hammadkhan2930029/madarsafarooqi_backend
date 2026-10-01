'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'mysql://user:password@localhost:3306/test';
process.env.JWT_ACCESS_SECRET ||= 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET ||= 'b'.repeat(32);
const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const express = require('express');
const request = require('supertest');
const { createHolidayRouter } = require('../src/modules/holidays/holiday.routes');
const { createHolidayService } = require('../src/modules/holidays/holiday.service');
const { errorHandler } = require('../src/middleware/errorHandler');
const { prisma } = require('../src/config/database');
after(() => prisma.$disconnect());
const item = { id: '1', title: 'Eid Holiday', description: null, startDate: '2026-09-01', endDate: '2026-09-03', affectsAttendance: true, status: 'ACTIVE', createdById: '1' };
const appFor = (role, service) => { const app = express(); app.use(express.json()); app.use('/api/holidays', createHolidayRouter(service, (req, _res, next) => { req.auth = { userId: '1', role }; next(); })); app.use(errorHandler); return app; };
test('Super Admin can create a single or ranged holiday', async () => {
  let received;
  const service = { create: async (values, auth) => { received = { values, auth }; return item; } };
  const response = await request(appFor('SUPER_ADMIN', service)).post('/api/holidays').send({ title: 'Eid Holiday', description: null, startDate: '2026-09-01', endDate: '2026-09-03', affectsAttendance: true });
  assert.equal(response.status, 201); assert.equal(received.auth.role, 'SUPER_ADMIN'); assert.equal(received.values.affectsAttendance, true);
});
test('Teacher cannot read or modify Holiday Management', async () => {
  const list = await request(appFor('TEACHER', {})).get('/api/holidays');
  const create = await request(appFor('TEACHER', {})).post('/api/holidays').send({});
  assert.equal(list.status, 403); assert.equal(create.status, 403);
});
test('invalid and reversed holiday dates are rejected', async () => {
  const service = { create: async () => item };
  const invalid = await request(appFor('SUPER_ADMIN', service)).post('/api/holidays').send({ title: 'Holiday', description: null, startDate: '2026-02-30', endDate: '2026-02-30', affectsAttendance: true });
  const reversed = await request(appFor('SUPER_ADMIN', service)).post('/api/holidays').send({ title: 'Holiday', description: null, startDate: '2026-09-03', endDate: '2026-09-01', affectsAttendance: true });
  assert.equal(invalid.status, 422); assert.equal(reversed.status, 422);
});
test('delete is a soft deactivation', async () => {
  let status;
  const service = { updateStatus: async (_id, value) => { status = value; return { ...item, status: value }; } };
  const response = await request(appFor('SUPER_ADMIN', service)).delete('/api/holidays/1');
  assert.equal(response.status, 200); assert.equal(status, 'INACTIVE');
});
test('service returns creator and preserves attendance-impact control', async () => {
  const now = new Date();
  const database = { holiday: { create: async args => ({ id: 1n, status: 'ACTIVE', createdAt: now, updatedAt: now, ...args.data, createdBy: { id: 1n, name: 'Admin', loginId: 'admin' } }) } };
  const result = await createHolidayService(database).create({ title: 'Holiday', description: '', startDate: '2026-09-01', endDate: '2026-09-01', affectsAttendance: false }, { userId: '1' });
  assert.equal(result.affectsAttendance, false); assert.equal(result.createdBy.name, 'Admin'); assert.equal(result.startDate, '2026-09-01');
});
