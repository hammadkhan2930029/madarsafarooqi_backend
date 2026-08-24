'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'mysql://user:password@localhost:3306/smarthazri_test';
process.env.JWT_ACCESS_SECRET ||= 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET ||= 'b'.repeat(32);

const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const express = require('express');
const request = require('supertest');
const { createStudentRouter } = require('../src/modules/students/student.routes');
const { createStudentService, normalizeAdmissionNo, serializeStudent } = require('../src/modules/students/student.service');
const { errorHandler } = require('../src/middleware/errorHandler');
const { prisma } = require('../src/config/database');

after(() => prisma.$disconnect());
const student = { id: 1n, admissionNo: 'ADM-001', name: 'Student One', fatherName: 'Father One', contact: null, branchId: 1n, classId: 1n, status: 'ACTIVE', createdById: 1n, createdAt: new Date(), updatedAt: new Date(), branch: { id: 1n, name: 'Main', code: 'MAIN', status: 'ACTIVE' }, class: { id: 1n, name: 'One', branchId: 1n, status: 'ACTIVE' } };
const makeApp = (role, service) => { const app = express(); app.use(express.json()); app.use('/api/students', createStudentRouter(service, (req, _res, next) => { req.auth = { userId: '1', role }; next(); })); app.use(errorHandler); return app; };

test('normalizes admission numbers consistently', () => assert.equal(normalizeAdmissionNo(' adm  / 001 '), 'ADM/001'));

test('Super Admin creates a validated Student with server identity', async () => {
  let received; const service = { create: async (values, auth) => { received = { values, auth }; return serializeStudent(student); } };
  const response = await request(makeApp('SUPER_ADMIN', service)).post('/api/students').send({ admissionNo: 'adm-001', name: 'Student One', fatherName: 'Father One', contact: null, branchId: '1', classId: '1' });
  assert.equal(response.status, 201, JSON.stringify(response.body)); assert.equal(received.auth.userId, '1'); assert.equal(received.values.createdById, undefined);
});

test('Teacher has no Student endpoint access', async () => {
  for (const [method, path] of [['get', '/api/students'], ['post', '/api/students'], ['delete', '/api/students/1']]) {
    const response = await request(makeApp('TEACHER', {}))[method](path);
    assert.equal(response.status, 403); assert.equal(response.body.error.code, 'FORBIDDEN');
  }
});

test('list forwards name/admission search, relation filters and pagination', async () => {
  let received; const service = { list: async query => { received = query; return { items: [], pagination: { page: 2, limit: 10, total: 0, totalPages: 1 } }; } };
  const response = await request(makeApp('SUPER_ADMIN', service)).get('/api/students?search=ADM&branchId=1&classId=2&status=ACTIVE&page=2&limit=10');
  assert.equal(response.status, 200); assert.deepEqual(received, { search: 'ADM', branchId: '1', classId: '2', status: 'ACTIVE', page: 2, limit: 10 });
});

test('new assignment requires active matching branch and class', async () => {
  const database = { branch: { findUnique: async () => ({ id: 1n, status: 'ACTIVE' }) }, class: { findUnique: async () => ({ id: 2n, branchId: 9n, status: 'ACTIVE' }) } };
  database.$transaction = async callback => callback(database);
  await assert.rejects(() => createStudentService(database).create({ admissionNo: 'A-1', name: 'Student', fatherName: 'Father', contact: null, branchId: '1', classId: '2' }, { userId: '1' }), error => error.code === 'CLASS_BRANCH_MISMATCH');
});

test('unrelated edits preserve an existing inactive assignment', async () => {
  let updateData;
  const inactive = { ...student, branch: { ...student.branch, status: 'INACTIVE' }, class: { ...student.class, status: 'INACTIVE' } };
  const database = { student: { findUnique: async () => inactive, update: async args => { updateData = args.data; return { ...inactive, ...args.data }; } } };
  database.$transaction = async callback => callback(database);
  const result = await createStudentService(database).update('1', { name: 'Changed' });
  assert.equal(result.name, 'Changed'); assert.deepEqual(updateData, { name: 'Changed' });
});

test('DELETE uses soft deactivation instead of deleting the record', async () => {
  let status; const database = { student: { findUnique: async () => student, update: async args => { status = args.data.status; return { ...student, status }; } } };
  const result = await createStudentService(database).remove('1');
  assert.equal(status, 'INACTIVE'); assert.equal(result.status, 'INACTIVE'); assert.equal(database.student.delete, undefined);
});

test('invalid identifiers and relation filters return safe errors', async () => {
  const service = { list: async () => ({ items: [], pagination: {} }), get: async () => serializeStudent(student) };
  assert.equal((await request(makeApp('SUPER_ADMIN', service)).get('/api/students?branchId=bad')).status, 422);
  assert.equal((await request(makeApp('SUPER_ADMIN', service)).get('/api/students/0')).status, 422);
});
